package com.comtammatu.relay

import kotlin.math.max
import kotlin.math.roundToInt

data class PreparedRaster(
    val width: Int,
    val height: Int,
    val blackPixels: ByteArray
)

/**
 * Prepares a 1-bit ESC/POS raster for Vietnamese OCR: pad tone-mark space,
 * then upscale a typical 384–576 px thermal width. Do not dilate: thermal
 * glyphs are already thick and 8-connected thickening fuses digits.
 */
object ReceiptOcrPreprocessor {
    const val MIN_WIDTH_PX = 1152
    const val MAX_LONG_EDGE_PX = 2800
    const val TONE_PAD_PX = 6

    fun scaleFactor(width: Int, height: Int): Double {
        if (width <= 0 || height <= 0) return 1.0
        val up = max(1.0, MIN_WIDTH_PX.toDouble() / width.toDouble())
        val scaledLongEdge = max(width, height) * up
        return if (scaledLongEdge <= MAX_LONG_EDGE_PX) {
            up
        } else {
            MAX_LONG_EDGE_PX.toDouble() / max(width, height).toDouble()
        }
    }

    fun targetSize(width: Int, height: Int): Pair<Int, Int> {
        if (width <= 0 || height <= 0) return width.coerceAtLeast(0) to height.coerceAtLeast(0)
        val factor = scaleFactor(width, height)
        return (width * factor).roundToInt().coerceAtLeast(1) to
            (height * factor).roundToInt().coerceAtLeast(1)
    }

    fun prepare(width: Int, height: Int, blackPixels: ByteArray): PreparedRaster {
        require(blackPixels.size == width * height) {
            "Raster pixel count ${blackPixels.size} does not match ${width}x$height"
        }
        val padded = padToneMarks(width, height, blackPixels)
        val (targetWidth, targetHeight) = targetSize(padded.width, padded.height)
        return scaleNearest(padded, targetWidth, targetHeight)
    }

    internal fun padToneMarks(width: Int, height: Int, blackPixels: ByteArray): PreparedRaster {
        val pad = TONE_PAD_PX
        val newHeight = height + pad * 2
        val output = ByteArray(width * newHeight)
        blackPixels.copyInto(output, destinationOffset = pad * width)
        return PreparedRaster(width, newHeight, output)
    }

    internal fun dilate(width: Int, height: Int, blackPixels: ByteArray): PreparedRaster {
        val output = ByteArray(blackPixels.size)
        for (y in 0 until height) {
            for (x in 0 until width) {
                if (hasBlackNeighbor(blackPixels, width, height, x, y)) {
                    output[y * width + x] = 1
                }
            }
        }
        return PreparedRaster(width, height, output)
    }

    private fun hasBlackNeighbor(
        pixels: ByteArray,
        width: Int,
        height: Int,
        x: Int,
        y: Int
    ): Boolean {
        for (dy in -1..1) {
            for (dx in -1..1) {
                val nx = x + dx
                val ny = y + dy
                if (nx in 0 until width && ny in 0 until height && pixels[ny * width + nx].toInt() == 1) {
                    return true
                }
            }
        }
        return false
    }

    private fun scaleNearest(source: PreparedRaster, targetWidth: Int, targetHeight: Int): PreparedRaster {
        if (source.width == targetWidth && source.height == targetHeight) return source
        val output = ByteArray(targetWidth * targetHeight)
        for (y in 0 until targetHeight) {
            val sourceY = (y * source.height) / targetHeight
            for (x in 0 until targetWidth) {
                val sourceX = (x * source.width) / targetWidth
                output[y * targetWidth + x] = source.blackPixels[sourceY * source.width + sourceX]
            }
        }
        return PreparedRaster(targetWidth, targetHeight, output)
    }
}
