package com.ainshop.app.voice

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.ainshop.app.data.Languages
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.buffer
import okio.sink
import java.io.File
import java.util.concurrent.TimeUnit

// AIN Shop — Whisper on the phone, the backup listener.
// Used only when the phone's own speech recognition doesn't cover the
// shopper's language. No training anything: the released Whisper model
// is used exactly as it is.
//
// How it works:
//   1. sherpa-onnx (k2-fsa) runs Whisper fully on-device. It is NOT on
//      Maven Central: the AAR is vendored in app/libs/ (see README there
//      and scripts/fetch-sherpa-onnx.sh). If the AAR was never fetched,
//      this whole file stays dormant — isAvailable() is false and the
//      app simply reports Whisper as unavailable.
//   2. The model itself is NOT bundled in the app. On first use, with the
//      shopper's yes, the small multilingual Whisper model (tiny, ~75 MB)
//      is downloaded over Wi-Fi from Hugging Face into the app's own
//      files and kept there. Nothing is uploaded anywhere.
//   3. Recording is done with AudioRecord (16 kHz mono) and a simple
//      energy check: it stops after about 1.5 seconds of quiet, or 30
//      seconds at most.
//
// NOTE FOR THE FIRST BUILD TEST: the sherpa-onnx Java API names used
// here (OfflineRecognizer, OfflineRecognizerConfig, OfflineModelConfig,
// OfflineWhisperModelConfig, createStream, acceptWaveform, decode,
// getResult().text) must be confirmed against the vendored
// sherpa-onnx 1.13.3 Javadoc. If a name moved between versions, only
// this file changes — the rest of the app talks to WhisperFallback.

object WhisperFallback {

    private const val SAMPLE_RATE = 16000
    private const val MAX_SECONDS = 30
    private const val SILENCE_MS = 1500L

    // Released tiny multilingual Whisper model, as published for sherpa-onnx.
    private const val MODEL_BASE =
        "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main"
    private val MODEL_FILES = listOf(
        "tiny-encoder.int8.onnx" to "tiny-encoder.int8.onnx",
        "tiny-decoder.int8.onnx" to "tiny-decoder.int8.onnx",
        "tiny-tokens.txt" to "tiny-tokens.txt",
    )

    fun modelDir(context: Context): File = File(context.filesDir, "whisper-tiny")

    fun isModelDownloaded(context: Context): Boolean {
        val dir = modelDir(context)
        return MODEL_FILES.all { File(dir, it.second).exists() }
    }

    /** True only when the vendored AAR is present AND a model is on disk. */
    fun isAvailable(context: Context): Boolean {
        if (!isModelDownloaded(context)) return false
        return try {
            Class.forName("com.k2fsa.sherpa.onnx.OfflineRecognizer")
            true
        } catch (e: ClassNotFoundException) {
            false
        }
    }

    /** Download the model files (about 75 MB total). Call only after the
     *  shopper said yes. Reports 0..100 progress; returns false on failure. */
    suspend fun downloadModel(
        context: Context,
        onProgress: (Int) -> Unit,
    ): Boolean = withContext(Dispatchers.IO) {
        val dir = modelDir(context)
        if (!dir.exists()) dir.mkdirs()
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build()
        try {
            MODEL_FILES.forEachIndexed { index, (remote, local) ->
                val target = File(dir, local)
                if (target.exists() && target.length() > 0) {
                    onProgress(((index + 1) * 100) / MODEL_FILES.size)
                    return@forEachIndexed
                }
                val request = Request.Builder().url("$MODEL_BASE/$remote").build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext false
                    val body = response.body ?: return@withContext false
                    val tmp = File(dir, "$local.tmp")
                    body.byteStream().use { input ->
                        tmp.sink().buffer().use { sink -> sink.writeAll(okio.source(input)) }
                    }
                    tmp.renameTo(target)
                }
                onProgress(((index + 1) * 100) / MODEL_FILES.size)
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Record one utterance from the microphone and transcribe it on-device.
     *  Returns the heard text, or null when nothing usable was heard.
     *  The language is the shopper's language (e.g. "yi" for Yiddish);
     *  Whisper's multilingual model covers all 50 app languages. */
    suspend fun listenOnce(
        context: Context,
        languageCode: String,
    ): String? = withContext(Dispatchers.Default) {
        if (!isAvailable(context)) return@withContext null
        val samples = recordUtterance() ?: return@withContext null
        if (samples.size < SAMPLE_RATE / 2) return@withContext null
        try {
            transcribe(context, samples, languageCode)
        } catch (e: Exception) {
            null
        }
    }

    /** Record until ~1.5 s of quiet or 30 s max. Simple energy check:
     *  the room must be quiet-ish for it to stop; a loud shop keeps it
     *  recording until the cap. Returns 16 kHz mono float samples. */
    private fun recordUtterance(): FloatArray? {
        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer <= 0) return null
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, minBuffer * 4
        )
        if (recorder.state != AudioRecord.STATE_INITIALIZED) return null
        val chunks = ArrayList<Short>(SAMPLE_RATE * 8)
        val buffer = ShortArray(minBuffer)
        var quietSince = System.currentTimeMillis()
        var heardSpeech = false
        val started = System.currentTimeMillis()
        try {
            recorder.startRecording()
            while (System.currentTimeMillis() - started < MAX_SECONDS * 1000L) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read <= 0) continue
                var energy = 0.0
                for (i in 0 until read) {
                    chunks.add(buffer[i])
                    val v = buffer[i] / 32768.0
                    energy += v * v
                }
                val rms = kotlin.math.sqrt(energy / read)
                if (rms > 0.02) {
                    heardSpeech = true
                    quietSince = System.currentTimeMillis()
                } else if (heardSpeech && System.currentTimeMillis() - quietSince > SILENCE_MS) {
                    break
                }
            }
        } catch (e: Exception) {
            return null
        } finally {
            try { recorder.stop() } catch (e: Exception) {}
            recorder.release()
        }
        if (!heardSpeech) return null
        return FloatArray(chunks.size) { chunks[it] / 32768f }
    }

    // ---- sherpa-onnx JNI, reached through the vendored AAR ----
    // The classes below are only touched when isAvailable() is true, so a
    // build without the AAR still compiles and runs (Whisper just reports
    // itself unavailable). The exact constructor shapes follow the
    // sherpa-onnx 1.13.3 Java API; confirm them at the first build test.

    private fun transcribe(context: Context, samples: FloatArray, languageCode: String): String? {
        val lang = Languages.byCode(languageCode)
        val dir = modelDir(context).absolutePath
        // Whisper wants a short language tag ("en", "he", "yi", …).
        val whisperLang = lang.speechLocale.substringBefore('-').lowercase()

        val whisperConfig = com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig(
            "$dir/tiny-encoder.int8.onnx",
            "$dir/tiny-decoder.int8.onnx",
            whisperLang,
            "transcribe",
            50
        )
        val modelConfig = com.k2fsa.sherpa.onnx.OfflineModelConfig(
            whisperConfig, numThreads = 2, debug = false, provider = "cpu"
        )
        val recognizerConfig = com.k2fsa.sherpa.onnx.OfflineRecognizerConfig(
            modelConfig, decodingMethod = "greedy_search", maxActivePaths = 4
        )
        val recognizer = com.k2fsa.sherpa.onnx.OfflineRecognizer(recognizerConfig)
        try {
            val stream = recognizer.createStream()
            stream.acceptWaveform(samples, SAMPLE_RATE)
            recognizer.decode(stream)
            val text = stream.result.text.trim()
            return text.ifEmpty { null }
        } finally {
            recognizer.release()
        }
    }
}
