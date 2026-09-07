package com.comtammatu.relay

import android.os.SystemClock
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class ReceiptOcrResult(
    val engine: String,
    val text: String?,
    val rawText: String? = text,
    val elapsedMs: Long,
    val bitmapWidth: Int,
    val bitmapHeight: Int
)

/** Runs bundled on-device OCR for delivery apps that print the receipt as one bitmap. */
class ReceiptTextRecognizer {
    companion object {
        const val ENGINE_MLKIT_PREPROCESS = "mlkit_preprocess"
        private const val MAX_TEXT_LENGTH = 64 * 1024
    }

    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    suspend fun recognize(rawBytes: ByteArray): String? = recognizeDetailed(rawBytes).text

    suspend fun recognizeDetailed(rawBytes: ByteArray): ReceiptOcrResult {
        val raster = EscPosRasterDecoder.decodeLargest(rawBytes)
            ?: return ReceiptOcrResult(
                engine = ENGINE_MLKIT_PREPROCESS,
                text = null,
                rawText = null,
                elapsedMs = 0,
                bitmapWidth = 0,
                bitmapHeight = 0
            )
        val prepared = ReceiptOcrPreprocessor.prepare(raster.width, raster.height, raster.blackPixels)
        val bitmap = ReceiptOcrBitmaps.toArgb(prepared)
        val startedAt = SystemClock.elapsedRealtime()
        return try {
            val image = InputImage.fromBitmap(bitmap, 0)
            val recognized = suspendCancellableCoroutine<Pair<String?, String?>> { continuation ->
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
                                .trim()
                                .take(MAX_TEXT_LENGTH)
                                .ifBlank { null }
                            val normalized = layoutText?.let {
                                RasterReceiptTextNormalizer.normalize(it).trim().ifBlank { null }
                            }
                            continuation.resume(normalized to layoutText)
                        }
                    }
                    .addOnFailureListener { error ->
                        if (continuation.isActive) continuation.resumeWithException(error)
                    }
                    .addOnCanceledListener {
                        continuation.cancel()
                    }
            }
            val elapsedMs = SystemClock.elapsedRealtime() - startedAt
            AppLogger.i(
                "OCR",
                "ML Kit ${raster.width}×${raster.height} → ${bitmap.width}×${bitmap.height} trong ${elapsedMs}ms"
            )
            ReceiptOcrResult(
                engine = ENGINE_MLKIT_PREPROCESS,
                text = recognized.first,
                rawText = recognized.second,
                elapsedMs = elapsedMs,
                bitmapWidth = bitmap.width,
                bitmapHeight = bitmap.height
            )
        } finally {
            bitmap.recycle()
        }
    }

    fun close() {
        recognizer.close()
    }
}
