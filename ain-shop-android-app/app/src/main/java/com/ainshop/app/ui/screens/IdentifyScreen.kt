package com.ainshop.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.util.Base64
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.ainshop.app.barcode.BarcodeReader
import com.ainshop.app.camera.SteadyDetector
import com.ainshop.app.ui.AppViewModel
import com.ainshop.app.ui.components.BigButton
import com.ainshop.app.ui.components.SpokenText
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

// AIN Shop — camera "what is this?".
// The photo is taken automatically once the phone has been held still
// for two seconds (the steady detector), or when the shopper says
// "take it" or taps the button. What happens to the photo, in order:
//   1. Barcode first: the still photo is read for a barcode (the
//      phone's own detector, then the bundled ZXing fallback). A
//      barcode is exact, so it wins over a guess from the picture.
//   2. Otherwise the photo goes to the vision AI, which describes
//      only what is visible, in plain words, never guessing a brand,
//      size or price — and the app says it as an impression ("from the
//      picture, it looks like…").
// The photo is NEVER stored: it lives only as a bitmap in memory until
// the answer comes back, and is never written to disk or shared.
// If it cannot be identified, the app says so honestly.

@Composable
fun IdentifyScreen(viewModel: AppViewModel) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by viewModel.state.collectAsState()
    val scope = rememberCoroutineScope()
    val executor = remember { Executors.newSingleThreadExecutor() }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var checking by remember { mutableStateOf(false) }
    var capturedOnce by remember { mutableStateOf(false) }
    var lastPhotoRequest by remember { mutableStateOf(0) }
    val hasCameraPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED

    fun capture() {
        val capture = imageCapture ?: return
        if (checking) return
        checking = true
        capture.takePicture(
            executor,
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val bitmap = image.toBitmap()
                    image.close()
                    scope.launch {
                        // 1. Barcode first — exact beats an impression.
                        val code = BarcodeReader.read(bitmap)
                        if (code != null && code.any { it.isDigit() } && code.length in 8..14) {
                            checking = false
                            viewModel.onBarcodeRead(code, "EAN_13")
                            return@launch
                        }
                        // 2. Vision: describe only what is visible.
                        val dataUrl = bitmapToDataUrl(bitmap)
                        checking = false
                        viewModel.identifyPhoto(dataUrl, state.identifyMode)
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    checking = false
                    viewModel.speak("I couldn't take the photo. Try again.", thenListen = false)
                }
            },
        )
    }

    // Auto-capture when the phone is held still for two seconds.
    val steadyDetector = remember {
        SteadyDetector(context) {
            if (!capturedOnce) {
                capturedOnce = true
                capture()
            }
        }
    }
    DisposableEffect(Unit) {
        steadyDetector.start()
        onDispose { steadyDetector.stop(); executor.shutdown() }
    }

    // "Take it" by voice, from anywhere in the app.
    LaunchedEffect(state.photoRequest) {
        if (state.photoRequest > 0 && state.photoRequest != lastPhotoRequest) {
            lastPhotoRequest = state.photoRequest
            capturedOnce = true
            capture()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp)
            .semantics { contentDescription = "Camera: what is this" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("What is this?", style = MaterialTheme.typography.displayLarge)
        Text(
            if (checking) "Checking the photo…"
            else "Hold the item up. I'll take the photo when the phone is still — or say \"take it\".",
            style = MaterialTheme.typography.bodyLarge,
        )
        if (!hasCameraPermission) {
            Text(
                "The camera permission is off, so I can't take a photo. Allow the camera and come back.",
                style = MaterialTheme.typography.bodyLarge,
            )
        } else {
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).also { previewView ->
                        val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                        cameraProviderFuture.addListener({
                            val cameraProvider = cameraProviderFuture.get()
                            val preview = Preview.Builder().build().also {
                                it.setSurfaceProvider(previewView.surfaceProvider)
                            }
                            val captureUseCase = ImageCapture.Builder()
                                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                                .build()
                            imageCapture = captureUseCase
                            try {
                                cameraProvider.unbindAll()
                                cameraProvider.bindToLifecycle(
                                    lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, captureUseCase
                                )
                            } catch (e: Exception) {
                                // No camera, or it is busy.
                            }
                        }, ContextCompat.getMainExecutor(ctx))
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp)
                    .semantics { contentDescription = "Camera view. Hold the item up." },
            )
        }
        SpokenText(state.lastSpoken)
        BigButton("Take the photo", onClick = { capturedOnce = true; capture() })
        if (capturedOnce) {
            BigButton(
                "Take another",
                onClick = { capturedOnce = false; checking = false },
                secondary = true,
            )
        }
        BigButton("Back home", onClick = { viewModel.dispatch(com.ainshop.app.voice.VoiceAction.GoBack) }, secondary = true)
    }
}

private fun bitmapToDataUrl(bitmap: Bitmap): String {
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
    return "data:image/jpeg;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
}
