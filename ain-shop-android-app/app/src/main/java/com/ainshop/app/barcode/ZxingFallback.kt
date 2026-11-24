package com.ainshop.app.barcode

import android.graphics.Bitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.RGBLuminanceSource

// AIN Shop — ZXing fallback for reading barcode stripes from a still photo.
// The phone's own detector (ML Kit, see BarcodeReader) runs first; when it
// cannot read the stripes, the still photo is tried with ZXing instead.
// Reading stripes needs no database and no network: any printed barcode
// in a standard format reads. Formats covered: EAN-13, EAN-8, UPC-A,
// UPC-E and QR, plus the other common retail formats (Code 39, Code 128,
// ITF, Data Matrix, PDF 417). No key, no sign-up, nothing paid.

object ZxingFallback {

    private val FORMATS = listOf(
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_128,
        BarcodeFormat.ITF,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.PDF_417,
    )

    /** Decode a still photo. Returns the barcode text (digits for a
     *  product barcode, the link/text for a QR code), or null. */
    fun decode(bitmap: Bitmap): String? {
        val hints = mapOf(
            DecodeHintType.POSSIBLE_FORMATS to FORMATS,
            DecodeHintType.TRY_HARDER to true,
        )
        // Full frame first, then a centre crop — a barcode is usually
        // held in the middle of the picture.
        val candidates = listOf(bitmap) + runCatching { listOf(centerCrop(bitmap)) }.getOrElse { emptyList() }
        for (candidate in candidates) {
            try {
                val pixels = IntArray(candidate.width * candidate.height)
                candidate.getPixels(pixels, 0, candidate.width, 0, 0, candidate.width, candidate.height)
                val source = RGBLuminanceSource(candidate.width, candidate.height, pixels)
                val result = MultiFormatReader().apply { setHints(hints) }
                    .decode(BinaryBitmap(HybridBinarizer(source)))
                if (result.text.isNotBlank()) return result.text.trim()
            } catch (e: Exception) {
                // Not readable in this crop — try the next one.
            }
        }
        return null
    }

    private fun centerCrop(bitmap: Bitmap): Bitmap {
        val size = minOf(bitmap.width, bitmap.height)
        val x = (bitmap.width - size) / 2
        val y = (bitmap.height - size) / 2
        return Bitmap.createBitmap(bitmap, x, y, size, size)
    }
}
