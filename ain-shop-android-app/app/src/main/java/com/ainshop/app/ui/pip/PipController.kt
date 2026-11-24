package com.ainshop.app.ui.pip

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// AIN Shop — picture-in-picture mini window, like YouTube.
// The app keeps talking in a small floating window while the shopper
// opens other apps. Shopping continues by voice in the small window —
// for example, browsing men's clothing while the app keeps reading.
// A tap on the small window returns to full screen.
//
// How it works (Android's own picture-in-picture, API 26+):
//   - The activity enters PiP; Android keeps it alive, so the speech
//     recognizer and text-to-speech keep running in the small window.
//   - The small window shows a compact screen (MiniWindowScreen): what
//     is happening now, a big Talk button and a Stop button.
//   - The window's own buttons (RemoteActions) are Talk and Stop.
//     Tapping the window itself expands back to full screen — that is
//     Android's built-in behaviour, no code needed for it.
//   - Entering: the "Mini window" button, the voice command
//     "mini window", or pressing Home while a voice session is active.
//   - Leaving: tap the window, or the voice command "full screen".
// On phones below Android 8 (API 26) there is no PiP; the button and
// the voice command simply say so.

class PipController(private val activity: ComponentActivity) {

    companion object {
        const val ACTION_TALK = "com.ainshop.app.PIP_TALK"
        const val ACTION_STOP = "com.ainshop.app.PIP_STOP"
        private const val REQUEST_TALK = 1001
        private const val REQUEST_STOP = 1002
    }

    private val _inPip = MutableStateFlow(false)
    val inPip: StateFlow<Boolean> = _inPip.asStateFlow()

    val isSupported: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O

    /** Called when the Talk button in the small window is tapped. */
    var onTalk: (() -> Unit)? = null

    /** Called when the Stop button in the small window is tapped. */
    var onStop: (() -> Unit)? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                ACTION_TALK -> onTalk?.invoke()
                ACTION_STOP -> onStop?.invoke()
            }
        }
    }

    private var registered = false

    fun register() {
        if (registered || !isSupported) return
        val filter = IntentFilter().apply {
            addAction(ACTION_TALK)
            addAction(ACTION_STOP)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            activity.registerReceiver(receiver, filter)
        }
        registered = true
    }

    fun unregister() {
        if (!registered) return
        try {
            activity.unregisterReceiver(receiver)
        } catch (e: Exception) {
        }
        registered = false
    }

    fun onPipModeChanged(inPip: Boolean) {
        _inPip.value = inPip
    }

    /** Enter the mini window. Does nothing on phones without PiP. */
    fun enterPip() {
        if (!isSupported) return
        activity.enterPictureInPictureMode(buildParams())
    }

    /** Refresh the small window's buttons (e.g. Talk becomes Stop while
     *  listening). Safe to call any time; ignored outside PiP. */
    fun updateActions(isListening: Boolean) {
        if (!isSupported || !_inPip.value) return
        try {
            activity.setPictureInPictureParams(buildParams(isListening))
        } catch (e: Exception) {
        }
    }

    private fun buildParams(isListening: Boolean = false): PictureInPictureParams {
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .setActions(listOf(talkAction(isListening), stopAction()))
        // Android 12+: also enter automatically when the shopper presses
        // Home during a voice session (MainActivity calls enterPip from
        // onUserLeaveHint as well, so older phones get the same behaviour).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(true)
        }
        return builder.build()
    }

    private fun talkAction(isListening: Boolean): RemoteAction {
        val intent = Intent(ACTION_TALK).setPackage(activity.packageName)
        val pending = PendingIntent.getBroadcast(
            activity, REQUEST_TALK, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val icon = Icon.createWithResource(
            activity,
            if (isListening) android.R.drawable.ic_media_pause
            else android.R.drawable.ic_btn_speak_now
        )
        return RemoteAction(icon, if (isListening) "Stop listening" else "Talk", "Talk to AIN Shop", pending)
    }

    private fun stopAction(): RemoteAction {
        val intent = Intent(ACTION_STOP).setPackage(activity.packageName)
        val pending = PendingIntent.getBroadcast(
            activity, REQUEST_STOP, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val icon = Icon.createWithResource(activity, android.R.drawable.ic_media_pause)
        return RemoteAction(icon, "Stop speaking", "Stop AIN Shop speaking", pending)
    }
}
