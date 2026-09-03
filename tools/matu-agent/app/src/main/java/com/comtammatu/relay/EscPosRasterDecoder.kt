package com.comtammatu.relay

data class EscPosRaster(
    val width: Int,
    val height: Int,
    val blackPixels: ByteArray
)

/** Decodes the largest GS v 0 monochrome raster in an ESC/POS stream. */
object EscPosRasterDecoder {
    private const val HEADER_BYTES = EscPosRasterFormat.HEADER_BYTES
    private const val MAX_PIXELS = 4_000_000

    fun hasDecodableRaster(bytes: ByteArray): Boolean = firstValidHeader(bytes) != null

    fun decodeLargest(bytes: ByteArray): EscPosRaster? {
        var offset = 0
        var largest: EscPosRaster? = null

        while (offset + HEADER_BYTES <= bytes.size) {
            val header = readHeader(bytes, offset)
            if (header == null) {
                offset += 1
                continue
            }

            val blackPixels = ByteArray(header.pixelCount)
            for (row in 0 until header.height) {
                for (byteColumn in 0 until header.widthBytes) {
                    val packed = unsigned(bytes[header.payloadStart + row * header.widthBytes + byteColumn])
                    val pixelOffset = row * header.width + byteColumn * 8
                    for (bit in 0 until 8) {
                        if (packed and (0x80 shr bit) != 0) {
                            blackPixels[pixelOffset + bit] = 1
                        }
                    }
                }
            }

            val candidate = EscPosRaster(header.width, header.height, blackPixels)
            if (
                largest == null ||
                candidate.width.toLong() * candidate.height >
                largest.width.toLong() * largest.height
            ) {
                largest = candidate
            }
            offset = header.payloadEnd
        }

        return largest
    }

    private data class RasterHeader(
        val widthBytes: Int,
        val width: Int,
        val height: Int,
        val pixelCount: Int,
        val payloadStart: Int,
        val payloadEnd: Int
    )

    private fun firstValidHeader(bytes: ByteArray): RasterHeader? {
        var offset = 0
        while (offset + HEADER_BYTES <= bytes.size) {
            val header = readHeader(bytes, offset)
            if (header != null) return header
            offset += 1
        }
        return null
    }

    private fun readHeader(bytes: ByteArray, offset: Int): RasterHeader? {
        if (offset + HEADER_BYTES > bytes.size) return null
        if (!EscPosRasterFormat.isRasterPrefix(bytes, offset)) {
            return null
        }

        val widthBytes = unsigned(bytes[offset + 4]) +
            unsigned(bytes[offset + 5]) * 256
        val height = unsigned(bytes[offset + 6]) +
            unsigned(bytes[offset + 7]) * 256
        val width = widthBytes * 8
        val pixelCount = width.toLong() * height
        val payloadBytes = widthBytes.toLong() * height
        val payloadStart = offset + HEADER_BYTES
        val payloadEnd = payloadStart.toLong() + payloadBytes

        if (
            widthBytes <= 0 ||
            height <= 0 ||
            pixelCount > MAX_PIXELS ||
            payloadEnd > bytes.size
        ) {
            return null
        }

        return RasterHeader(
            widthBytes = widthBytes,
            width = width,
            height = height,
            pixelCount = pixelCount.toInt(),
            payloadStart = payloadStart,
            payloadEnd = payloadEnd.toInt()
        )
    }

    private fun unsigned(value: Byte): Int = value.toInt() and 0xFF
}
