package com.comtammatu.relay

import java.io.ByteArrayOutputStream

data class ReceiptDataLayers(
    val rawByteCount: Int,
    val raster: EscPosRaster?,
    val printableText: String?,
    val ocrText: String?
) {
    val bitmapLabel: String
        get() = raster?.let { "${it.width} × ${it.height} px" } ?: "Không có"

    val textCharacterCount: Int
        get() = printableText?.length ?: 0

    val ocrCharacterCount: Int
        get() = ocrText?.length ?: 0
}

/** Separates a stored ESC/POS receipt into independently inspectable data layers. */
object ReceiptDataInspector {
    fun inspect(rawBytes: ByteArray, ocrText: String?): ReceiptDataLayers = ReceiptDataLayers(
        rawByteCount = rawBytes.size,
        raster = EscPosRasterDecoder.decodeLargest(rawBytes),
        printableText = extractPrintableText(rawBytes),
        ocrText = ocrText?.trim()?.ifBlank { null }
    )

    fun extractPrintableText(rawBytes: ByteArray): String? {
        val output = ByteArrayOutputStream(rawBytes.size.coerceAtMost(64 * 1024))
        var offset = 0
        while (offset < rawBytes.size && output.size() < 64 * 1024) {
            val current = unsigned(rawBytes[offset])
            when {
                isRasterCommand(rawBytes, offset) -> {
                    offset = rasterCommandEnd(rawBytes, offset)
                }

                current == ESC -> offset += escCommandLength(rawBytes, offset)
                current == GS -> offset += gsCommandLength(rawBytes, offset)
                current == DLE || current == FS -> offset += 3
                current == LF || current == CR || current == TAB -> {
                    output.write(if (current == CR) LF else current)
                    offset += 1
                }

                current >= SPACE && current != DEL -> {
                    output.write(current)
                    offset += 1
                }

                else -> offset += 1
            }
        }

        val normalized = output.toByteArray()
            .toString(Charsets.UTF_8)
            .replace('\uFFFD', ' ')
            .lineSequence()
            .map(String::trimEnd)
            .fold(mutableListOf<String>()) { lines, line ->
                if (line.isNotBlank() || lines.lastOrNull()?.isNotBlank() == true) lines.add(line)
                lines
            }
            .joinToString("\n")
            .trim()

        if (normalized.isBlank()) return null
        val visible = normalized.count { !it.isWhitespace() }
        val meaningful = normalized.count { it.isLetterOrDigit() }
        if (meaningful < 8 || visible == 0 || meaningful.toDouble() / visible < 0.45) return null
        return normalized
    }

    private fun isRasterCommand(bytes: ByteArray, offset: Int): Boolean =
        offset + EscPosRasterFormat.HEADER_BYTES <= bytes.size &&
            EscPosRasterFormat.isRasterPrefix(bytes, offset)

    private fun rasterCommandEnd(bytes: ByteArray, offset: Int): Int {
        val widthBytes = unsigned(bytes[offset + 4]) + unsigned(bytes[offset + 5]) * 256
        val height = unsigned(bytes[offset + 6]) + unsigned(bytes[offset + 7]) * 256
        val payloadEnd =
            offset.toLong() + EscPosRasterFormat.HEADER_BYTES + widthBytes.toLong() * height
        return payloadEnd.coerceAtMost(bytes.size.toLong()).toInt()
    }

    private fun escCommandLength(bytes: ByteArray, offset: Int): Int {
        val command = bytes.getOrNull(offset + 1)?.let(::unsigned) ?: return 1
        return when (command) {
            ESC_INITIALIZE -> 2
            ESC_ABSOLUTE_POSITION, ESC_RELATIVE_POSITION -> 4
            else -> 3
        }.coerceAtMost(bytes.size - offset)
    }

    private fun gsCommandLength(bytes: ByteArray, offset: Int): Int {
        val command = bytes.getOrNull(offset + 1)?.let(::unsigned) ?: return 1
        if (command == GS_BARCODE) {
            var end = offset + 2
            while (end < bytes.size && unsigned(bytes[end]) != 0) end += 1
            return (end - offset + 1).coerceAtMost(bytes.size - offset)
        }
        return 3.coerceAtMost(bytes.size - offset)
    }

    private fun unsigned(value: Byte): Int = value.toInt() and 0xFF

    private const val DLE = 0x10
    private const val ESC = 0x1B
    private const val FS = 0x1C
    private const val GS = 0x1D
    private const val TAB = 0x09
    private const val LF = 0x0A
    private const val CR = 0x0D
    private const val SPACE = 0x20
    private const val DEL = 0x7F
    private const val ESC_INITIALIZE = 0x40
    private const val ESC_ABSOLUTE_POSITION = 0x24
    private const val ESC_RELATIVE_POSITION = 0x5C
    private const val GS_BARCODE = 0x6B
}
