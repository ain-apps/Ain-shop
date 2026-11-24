package com.ainshop.app.voice

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.ainshop.app.data.Languages
import com.ainshop.app.data.ResponseSpeed
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Locale
import java.util.UUID

// AIN Shop — the voice: hearing and speaking, on the phone.
// Hearing: Android's own speech recognition, preferring on-device
// (EXTRA_PREFER_OFFLINE) so the voice does not have to leave the phone
// and thousands of people can listen at once without one key being the
// bottleneck. Whisper on the phone (WhisperFallback) is the backup for
// languages the phone's own hearing doesn't cover.
// Speaking: Android TextToSpeech in the chosen language. No recording is
// kept; nothing is sent to a server except typed query text.

class SpeechEngine(private val context: Context) {

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var recognizer: SpeechRecognizer? = null
    private var currentLang: String = "en"
    private var speed: ResponseSpeed = ResponseSpeed.NORMAL

    private val _isSpeaking = MutableStateFlow(false)
    val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()
    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()

    private var onDoneCallback: (() -> Unit)? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    fun init(onReady: () -> Unit = {}) {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                ttsReady = true
                applyLanguage()
                applySpeed()
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String) {
                        _isSpeaking.value = true
                    }

                    override fun onDone(utteranceId: String) {
                        _isSpeaking.value = false
                        val cb = onDoneCallback
                        onDoneCallback = null
                        cb?.invoke()
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String) {
                        _isSpeaking.value = false
                        val cb = onDoneCallback
                        onDoneCallback = null
                        cb?.invoke()
                    }

                    override fun onError(utteranceId: String, errorCode: Int) {
                        _isSpeaking.value = false
                        val cb = onDoneCallback
                        onDoneCallback = null
                        cb?.invoke()
                    }
                })
                onReady()
            }
        }
    }

    fun setLanguage(code: String) {
        currentLang = code
        applyLanguage()
    }

    fun setSpeed(speed: ResponseSpeed) {
        this.speed = speed
        applySpeed()
    }

    private fun applyLanguage() {
        val lang = Languages.byCode(currentLang)
        val locale = Locale.forLanguageTag(lang.speechLocale)
        tts?.language = locale
        try {
            tts?.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
        } catch (e: Exception) {
            // Older phones: the default audio attributes still work.
        }
    }

    private fun applySpeed() {
        tts?.setSpeechRate(speed.rate)
        tts?.setPitch(1.0f)
    }

    /** Speak text aloud. When done, `onDone` runs on the main thread. */
    fun speak(text: String, onDone: (() -> Unit)? = null) {
        if (!ttsReady || text.isBlank()) {
            onDone?.invoke()
            return
        }
        onDoneCallback = onDone
        val utteranceId = UUID.randomUUID().toString()
        scope.launch {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        }
    }

    /** Speak after the current speech finishes (for queued sentences). */
    fun speakQueued(text: String) {
        if (!ttsReady || text.isBlank()) return
        val utteranceId = UUID.randomUUID().toString()
        tts?.speak(text, TextToSpeech.QUEUE_ADD, null, utteranceId)
    }

    fun stopSpeaking() {
        tts?.stop()
        _isSpeaking.value = false
        onDoneCallback = null
    }

    fun isRecognitionAvailable(): Boolean =
        SpeechRecognizer.isRecognitionAvailable(context)

    /**
     * Listen once, in [languageCode]. Calls [onFinal] with the best heard
     * sentence, [onPartial] as words arrive, and [onError] with one of:
     * "no_speech" | "network" | "language" | "busy" | "error".
     * Prefer-offline means the phone does the hearing itself where it can.
     */
    fun listen(
        languageCode: String,
        onPartial: (String) -> Unit = {},
        onFinal: (String) -> Unit,
        onError: (String) -> Unit,
    ) {
        if (!isRecognitionAvailable()) {
            onError("unavailable")
            return
        }
        stopListening()
        val lang = Languages.byCode(languageCode)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang.speechLocale)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            // On-device first: the voice stays on the phone when it can.
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { _isListening.value = true }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { _isListening.value = false }
                override fun onEvent(eventType: Int, params: Bundle?) {}

                override fun onError(error: Int) {
                    _isListening.value = false
                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH,
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> onError("no_speech")
                        SpeechRecognizer.ERROR_NETWORK,
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> onError("network")
                        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
                        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> onError("language")
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> onError("busy")
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> onError("permission")
                        else -> onError("error")
                    }
                }

                override fun onResults(results: Bundle?) {
                    _isListening.value = false
                    val heard = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    if (heard.isBlank()) onError("no_speech") else onFinal(heard)
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val heard = partialResults
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    if (heard.isNotBlank()) onPartial(heard)
                }
            })
            startListening(intent)
        }
    }

    fun stopListening() {
        try {
            recognizer?.cancel()
        } catch (e: Exception) {
        }
        recognizer?.destroy()
        recognizer = null
        _isListening.value = false
    }

    fun shutdown() {
        stopListening()
        stopSpeaking()
        tts?.shutdown()
        tts = null
    }
}
