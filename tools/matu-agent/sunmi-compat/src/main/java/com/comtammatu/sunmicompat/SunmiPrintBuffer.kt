package com.comtammatu.sunmicompat

import java.io.ByteArrayOutputStream

class SunmiPrintBuffer(
    private val maxPayloadBytes: Int
) {
    private val output = ByteArrayOutputStream()

    @Synchronized
    fun appendText(text: String): Boolean = appendRaw(text.toByteArray(Charsets.UTF_8))

    @Synchronized
    fun appendRaw(bytes: ByteArray): Boolean {
        if (bytes.isEmpty()) return true
        if (output.size().toLong() + bytes.size > maxPayloadBytes) return false
        output.write(bytes)
        return true
    }

    @Synchronized
    fun prependRaw(bytes: ByteArray): Boolean {
        if (bytes.isEmpty()) return true
        val current = output.toByteArray()
        if (current.size.toLong() + bytes.size > maxPayloadBytes) return false
        output.reset()
        output.write(bytes)
        output.write(current)
        return true
    }

    @Synchronized
    fun appendColumns(text: Array<out String>, widths: IntArray): Boolean {
        val line = text.mapIndexed { index, value ->
            val width = widths.getOrNull(index)?.coerceAtLeast(1) ?: value.length
            value.take(width).padEnd(width)
        }.joinToString(separator = "")
        return appendText("$line\n")
    }

    @Synchronized
    fun lineWrap(lines: Int): Boolean = appendText("\n".repeat(lines.coerceIn(0, 100)))

    @Synchronized
    fun markCommittedLine() = Unit

    @Synchronized
    fun clear() {
        output.reset()
    }

    @Synchronized
    fun hasData(): Boolean = output.size() > 0

    @Synchronized
    fun drainReceipt(includeCut: Boolean): ByteArray? {
        if (output.size() == 0) return null
        val receipt = output.toByteArray()
        output.reset()
        return if (includeCut) receipt + CUT_COMMAND else receipt
    }

    companion object {
        private val CUT_COMMAND = byteArrayOf(0x1D, 0x56, 0x41, 0x00)
    }
}

object EscPosRasterEncoder {
    fun encode(width: Int, height: Int, argb: IntArray): ByteArray {
        require(width > 0 && height > 0)
        require(argb.size == width * height)

        val widthBytes = (width + 7) / 8
        val payload = ByteArray(widthBytes * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                if (isBlack(argb[y * width + x])) {
                    val byteOffset = y * widthBytes + x / 8
                    payload[byteOffset] = (
                        payload[byteOffset].toInt() or (0x80 shr (x % 8))
                    ).toByte()
                }
            }
        }

        return byteArrayOf(
            0x1D, 0x76, 0x30, 0x00,
            (widthBytes and 0xFF).toByte(),
            ((widthBytes shr 8) and 0xFF).toByte(),
            (height and 0xFF).toByte(),
            ((height shr 8) and 0xFF).toByte()
        ) + payload
    }

    private fun isBlack(pixel: Int): Boolean {
        val alpha = pixel ushr 24 and 0xFF
        if (alpha < 128) return false
        val red = pixel ushr 16 and 0xFF
        val green = pixel ushr 8 and 0xFF
        val blue = pixel and 0xFF
        return (red * 299 + green * 587 + blue * 114) / 1000 < 160
    }
}
