package com.comtammatu.relay

import android.graphics.Bitmap
import android.graphics.Color
import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Runs bundled on-device OCR for delivery apps that print the receipt as one bitmap. */
class ReceiptTextRecognizer {
    companion object {
        private const val MAX_TEXT_LENGTH = 64 * 1024
    }

    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    suspend fun recognize(rawBytes: ByteArray): String? {
        val raster = EscPosRasterDecoder.decodeLargest(rawBytes) ?: return null
        val bitmap = raster.toOcrBitmap()
        val startedAt = SystemClock.elapsedRealtime()
        return try {
            val image = InputImage.fromBitmap(bitmap, 0)
            suspendCancellableCoroutine { continuation ->
                recognizer.process(image)
                    .addOnSuccessListener { result ->
                        if (continuation.isActive) {
                            val positionedLines = result.textBlocks.flatMap { block ->
                                block.lines.mapNotNull { line ->
                                    line.boundingBox?.let { box ->
                                        OcrPositionedLine(
                                            text = line.text,
                                            left = box.left,
                                            top = box.top,
                                            right = box.right,
                                            bottom = box.bottom
                                        )
                                    }
                                }
                            }
                            val layoutText = ReceiptOcrLayout.rebuild(positionedLines)
                                .ifBlank { result.text }
                            val elapsedMs = SystemClock.elapsedRealtime() - startedAt
                            AppLogger.i(
                                "OCR",
                                "Đã đọc ảnh ${raster.width}×${raster.height} → ${bitmap.width}×${bitmap.height} trong ${elapsedMs}ms"
                            )
                            continuation.resume(
                                RasterReceiptTextNormalizer.normalize(layoutText)
                                    .trim()
                                    .take(MAX_TEXT_LENGTH)
                                    .ifBlank { null }
                            )
                        }
                    }
                    .addOnFailureListener { error ->
                        if (continuation.isActive) continuation.resumeWithException(error)
                    }
                    .addOnCanceledListener {
                        continuation.cancel()
                    }
            }
        } finally {
            bitmap.recycle()
        }
    }

    fun close() {
        recognizer.close()
    }

    private fun EscPosRaster.toOcrBitmap(): Bitmap {
        val full = toBitmap()
        val (targetWidth, targetHeight) = AgentOcrPolicy.scaledSize(width, height)
        if (targetWidth == width && targetHeight == height) return full
        val scaled = Bitmap.createScaledBitmap(full, targetWidth, targetHeight, true)
        if (scaled != full) full.recycle()
        return scaled
    }

    private fun EscPosRaster.toBitmap(): Bitmap {
        val colors = IntArray(blackPixels.size) { index ->
            if (blackPixels[index].toInt() == 1) Color.BLACK else Color.WHITE
        }
        return Bitmap.createBitmap(colors, width, height, Bitmap.Config.RGB_565)
    }
}
