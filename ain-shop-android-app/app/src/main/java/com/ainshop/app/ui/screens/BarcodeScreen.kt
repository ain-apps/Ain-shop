package com.ainshop.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
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
import com.ainshop.app.ui.AppViewModel
import com.ainshop.app.ui.components.BigButton
import com.ainshop.app.ui.components.SpokenText
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

// AIN Shop — barcode scanning.
// READING the stripes: the phone's own detector (ML Kit, free,
// on-device) reads the live camera feed. If it can't read the stripes
// after a few seconds, the shopper takes a still photo instead, and
// the photo is read by ML Kit again and then by the bundled ZXing
// fallback (see BarcodeReader). Formats: EAN-13, EAN-8, UPC-A, UPC-E,
// QR, Code 39, Code 128, ITF, Data Matrix, PDF 417.
// KNOWING what the number is is a separate step (see
// AppViewModel.onBarcodeRead): taught on this phone, then the shared
// memory, then the server's ordered lookup (Open Food Facts family,
// then UPCitemdb's free trial), then a web search for the number.
// A QR code that is a web link opens in the browser; other QR text is
// read aloud.

@Composable
fun BarcodeScreen(viewModel: AppViewModel) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by viewModel.state.collectAsState()
    var found by remember { mutableStateOf<String?>(null) }
    var hint by remember { mutableStateOf("Point the camera at the barcode. Hold still.") }
    val hasCameraPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED

    LaunchedEffect(found) {
        if (found == null) {
            kotlinx.coroutines.delay(8_000)
            if (found == null) {
                hint = "Still nothing. Hold the barcode still, in good light — or take a photo of it instead."
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp)
            .semantics { contentDescription = "Barcode scanner" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Scan a barcode", style = MaterialTheme.typography.displayLarge)
        Text(hint, style = MaterialTheme.typography.bodyLarge)
        if (!hasCameraPermission) {
            Text(
                "The camera permission is off, so I can't scan. Allow the camera and come back.",
                style = MaterialTheme.typography.bodyLarge,
            )
        } else {
            CameraPreview(
                onBarcode = { code, format ->
                    if (found == null) {
                        found = code
                        if (format == Barcode.FORMAT_QR_CODE && code.startsWith("http")) {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(code)))
                            viewModel.speak("Opening that link.", thenListen = false)
                        } else if (format == Barcode.FORMAT_QR_CODE) {
                            viewModel.speak("That QR code says: $code", thenListen = false)
                        } else {
                            viewModel.onBarcodeRead(code, mlKitFormatName(format))
                        }
                    }
                },
            )
        }
        SpokenText(state.lastSpoken)
        BigButton(
            "Take a photo of it instead",
            onClick = { viewModel.openIdentify("barcode") },
            secondary = true,
        )
        BigButton("Back home", onClick = { viewModel.dispatch(com.ainshop.app.voice.VoiceAction.GoBack) }, secondary = true)
    }
}

private fun mlKitFormatName(format: Int): String = when (format) {
    Barcode.FORMAT_EAN_13 -> "EAN_13"
    Barcode.FORMAT_EAN_8 -> "EAN_8"
    Barcode.FORMAT_UPC_A -> "UPC_A"
    Barcode.FORMAT_UPC_E -> "UPC_E"
    Barcode.FORMAT_QR_CODE -> "QR_CODE"
    Barcode.FORMAT_CODE_39 -> "CODE_39"
    Barcode.FORMAT_CODE_128 -> "CODE_128"
    Barcode.FORMAT_ITF -> "ITF"
    Barcode.FORMAT_DATA_MATRIX -> "DATA_MATRIX"
    Barcode.FORMAT_PDF_417 -> "PDF_417"
    else -> "UNKNOWN"
}

@Composable
private fun CameraPreview(onBarcode: (String, Int) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    AndroidView(
        factory = { ctx ->
            PreviewView(ctx).also { previewView ->
                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val scanner = BarcodeScanning.getClient(
                        BarcodeScannerOptions.Builder()
                            .setBarcodeFormats(
                                Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
                                Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E,
                                Barcode.FORMAT_QR_CODE, Barcode.FORMAT_CODE_39,
                                Barcode.FORMAT_CODE_128, Barcode.FORMAT_ITF,
                                Barcode.FORMAT_DATA_MATRIX, Barcode.FORMAT_PDF_417,
                            )
                            .build()
                    )
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    analysis.setAnalyzer(executor) { imageProxy ->
                        val mediaImage = imageProxy.image
                        if (mediaImage != null) {
                            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                            scanner.process(image)
                                .addOnSuccessListener { barcodes ->
                                    barcodes.firstOrNull()?.rawValue?.let { code ->
                                        onBarcode(code, barcodes.first().format)
                                    }
                                }
                                .addOnCompleteListener { imageProxy.close() }
                        } else {
                            imageProxy.close()
                        }
                    }
                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis
                        )
                    } catch (e: Exception) {
                        // No camera, or it is busy — the photo fallback covers it.
                    }
                }, ContextCompat.getMainExecutor(ctx))
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .height(320.dp)
            .semantics { contentDescription = "Camera view. Point it at the barcode." },
    )
    DisposableEffect(Unit) {
        onDispose { executor.shutdown() }
    }
}
