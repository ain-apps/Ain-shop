package com.ainshop.app.barcode

import android.graphics.Bitmap
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

// AIN Shop — reading barcode stripes from a still photo.
// Order: the phone's own detector (ML Kit, free, on-device) first, then
// the bundled ZXing fallback (see ZxingFallback). Reading stripes needs
// no database: any printed barcode in a standard format reads.
// Knowing WHAT the number is is a separate step — see
// AppViewModel.onBarcodeRead (taught on this phone → the server's
// ordered lookup: Open Food Facts family, then UPCitemdb's free trial,
// then a whole-web search for the number itself).

object BarcodeReader {

    private val scanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_EAN_13,
                Barcode.FORMAT_EAN_8,
                Barcode.FORMAT_UPC_A,
                Barcode.FORMAT_UPC_E,
                Barcode.FORMAT_QR_CODE,
                Barcode.FORMAT_CODE_39,
                Barcode.FORMAT_CODE_128,
                Barcode.FORMAT_ITF,
                Barcode.FORMAT_DATA_MATRIX,
                Barcode.FORMAT_PDF_417,
            )
            .build()
    )

    /** Read a barcode from a still photo. Returns the digits/text, or
     *  null when nothing in the photo reads as a barcode. */
    suspend fun read(bitmap: Bitmap): String? {
        readWithMlKit(bitmap)?.let { return it }
        return ZxingFallback.decode(bitmap)
    }

    private suspend fun readWithMlKit(bitmap: Bitmap): String? =
        suspendCoroutine { cont ->
            try {
                scanner.process(InputImage.fromBitmap(bitmap, 0))
                    .addOnSuccessListener { barcodes ->
                        cont.resume(barcodes.firstOrNull()?.rawValue?.trim()?.takeIf { it.isNotBlank() })
                    }
                    .addOnFailureListener { cont.resume(null) }
            } catch (e: Exception) {
                cont.resume(null)
            }
        }
}
