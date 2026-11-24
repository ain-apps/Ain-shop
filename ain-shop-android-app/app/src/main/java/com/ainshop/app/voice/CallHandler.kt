package com.ainshop.app.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// AIN Shop — phone-call handling.
// If a phone call comes in while the shopper is using the app, the app
// pauses its voice (stops speaking AND listening), the call takes over,
// and when the call ends the app resumes exactly where it left off —
// same search, same results, nothing lost. The search and results live
// in AppViewModel and are also saved to the phone (see
// AppViewModel.saveSessionSnapshot), so even if Android kills the app
// while the call is going, coming back restores the same place.
//
// Two signals, because neither alone is enough:
//   1. Audio focus (no permission needed): a call always takes audio
//      focus away. Works on every phone, even if the shopper never
//      grants the phone-state permission.
//   2. Telephony call state (needs READ_PHONE_STATE, asked for once):
//      tells us exactly "a call is ringing / in progress / ended", so
//      a notification ducking the audio doesn't get mistaken for a call.
// The app never reads who is calling, and never records anything.

class CallHandler(private val context: Context) {

    private val audioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val telephonyManager =
        context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

    private val _inCall = MutableStateFlow(false)
    val inCall: StateFlow<Boolean> = _inCall.asStateFlow()

    /** Called once when voice must pause (a call started). */
    var onCallStarted: (() -> Unit)? = null

    /** Called once when voice may resume (the call ended). */
    var onCallEnded: (() -> Unit)? = null

    private var focusRequest: AudioFocusRequest? = null
    private var focusLost = false
    private var telephonyInCall = false
    private var paused = false

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                focusLost = true
                refreshPaused()
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                focusLost = false
                refreshPaused()
            }
            // LOSS_TRANSIENT_CAN_DUCK: a notification — keep talking.
            else -> Unit
        }
    }

    private val telephonyCallback: TelephonyCallback? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    when (state) {
                        TelephonyManager.CALL_STATE_RINGING,
                        TelephonyManager.CALL_STATE_OFFHOOK -> {
                            telephonyInCall = true
                            refreshPaused()
                        }
                        TelephonyManager.CALL_STATE_IDLE -> {
                            telephonyInCall = false
                            refreshPaused()
                        }
                    }
                }
            }
        } else null

    @Suppress("DEPRECATION")
    private val phoneStateListener: PhoneStateListener? =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    // The number is never read or stored.
                    when (state) {
                        TelephonyManager.CALL_STATE_RINGING,
                        TelephonyManager.CALL_STATE_OFFHOOK -> {
                            telephonyInCall = true
                            refreshPaused()
                        }
                        TelephonyManager.CALL_STATE_IDLE -> {
                            telephonyInCall = false
                            refreshPaused()
                        }
                    }
                }
            }
        } else null

    /** True when the app should be paused right now. */
    private fun shouldPause(): Boolean = focusLost || telephonyInCall

    private fun refreshPaused() {
        val wantPaused = shouldPause()
        if (wantPaused && !paused) {
            paused = true
            _inCall.value = telephonyInCall
            onCallStarted?.invoke()
        } else if (!wantPaused && paused) {
            paused = false
            _inCall.value = false
            onCallEnded?.invoke()
        }
        if (telephonyInCall) _inCall.value = true
    }

    fun hasPhoneStatePermission(): Boolean =
        ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED

    fun start() {
        // Take audio focus for the voice, so calls and other audio are
        // noticed immediately.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(focusListener)
                    .build()
                audioManager.requestAudioFocus(focusRequest!!)
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(
                    focusListener, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                )
            }
        } catch (e: Exception) {
            // Audio focus is best-effort; telephony still covers calls.
        }
        if (hasPhoneStatePermission()) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    telephonyCallback?.let {
                        telephonyManager.registerTelephonyCallback(
                            context.mainExecutor, it
                        )
                    }
                } else {
                    @Suppress("DEPRECATION")
                    phoneStateListener?.let {
                        telephonyManager.listen(it, PhoneStateListener.LISTEN_CALL_STATE)
                    }
                }
            } catch (e: Exception) {
                // Telephony is best-effort; audio focus still covers calls.
            }
        }
    }

    fun stop() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                audioManager.abandonAudioFocus(focusListener)
            }
        } catch (e: Exception) {
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyCallback?.let { telephonyManager.unregisterTelephonyCallback(it) }
            } else {
                @Suppress("DEPRECATION")
                phoneStateListener?.let { telephonyManager.listen(it, PhoneStateListener.LISTEN_NONE) }
            }
        } catch (e: Exception) {
        }
        focusLost = false
        telephonyInCall = false
        paused = false
        _inCall.value = false
    }
}
