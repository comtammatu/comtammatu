package com.comtammatu.relay

import java.io.ByteArrayOutputStream

/**
 * Responds to ESC/POS real-time status requests as a healthy online printer.
 * Clients must receive the response before they continue transmitting a job.
 */
class EscPosStatusResponder {
    companion object {
        private const val DLE = 0x10
        private const val EOT = 0x04
        private const val GS = 0x1D
        private const val TRANSMIT_STATUS = 0x72
        private const val AUTOMATIC_STATUS_BACK = 0x61
        private const val HEALTHY_REAL_TIME_STATUS = 0x12
        private const val HEALTHY_BUFFERED_STATUS = 0x00
        private val HEALTHY_AUTOMATIC_STATUS = byteArrayOf(0x10, 0x00, 0x00, 0x00)

        fun isStatusOnly(bytes: ByteArray): Boolean {
            if (bytes.isEmpty()) return false

            var offset = 0
            var queryCount = 0
            while (offset < bytes.size) {
                if (offset + 2 >= bytes.size) return false
                val first = unsigned(bytes[offset])
                val second = unsigned(bytes[offset + 1])
                val parameter = unsigned(bytes[offset + 2])
                val isRealTime = first == DLE && second == EOT && parameter in 1..4
                val isBuffered =
                    first == GS &&
                        second == TRANSMIT_STATUS &&
                        isBufferedStatusParameter(parameter)
                val isAutomatic = first == GS && second == AUTOMATIC_STATUS_BACK
                if (!isRealTime && !isBuffered && !isAutomatic) {
                    return false
                }
                queryCount += 1
                offset += 3
            }
            return queryCount > 0
        }

        private fun unsigned(value: Byte): Int = value.toInt() and 0xFF

        private fun isBufferedStatusParameter(value: Int): Boolean =
            value == 1 || value == 2 || value == 4 ||
                value == 49 || value == 50 || value == 52
    }

    private var state = 0

    fun responsesFor(bytes: ByteArray): ByteArray {
        val responses = ByteArrayOutputStream()
        for (byte in bytes) {
            val value = unsigned(byte)
            when (state) {
                0 -> state = when (value) {
                    DLE -> 1
                    GS -> 3
                    else -> 0
                }
                1 -> state = when (value) {
                    EOT -> 2
                    DLE -> 1
                    GS -> 3
                    else -> 0
                }
                2 -> {
                    if (value in 1..4) responses.write(HEALTHY_REAL_TIME_STATUS)
                    state = nextPrefixState(value)
                }
                3 -> state = when (value) {
                    TRANSMIT_STATUS -> 4
                    AUTOMATIC_STATUS_BACK -> 5
                    DLE -> 1
                    GS -> 3
                    else -> 0
                }
                4 -> {
                    if (isBufferedStatusParameter(value)) {
                        responses.write(HEALTHY_BUFFERED_STATUS)
                    }
                    state = nextPrefixState(value)
                }
                5 -> {
                    if (value != 0) responses.write(HEALTHY_AUTOMATIC_STATUS)
                    state = nextPrefixState(value)
                }
            }
        }
        return responses.toByteArray()
    }

    private fun nextPrefixState(value: Int): Int = when (value) {
        DLE -> 1
        GS -> 3
        else -> 0
    }
}

/** Finds receipt cut commands while skipping binary image and QR payloads. */
object EscPosReceiptBoundary {
    private const val ESC = 0x1B
    private const val GS = 0x1D

    fun hasCutCommand(bytes: ByteArray): Boolean {
        var offset = 0
        while (offset < bytes.size) {
            val command = unsigned(bytes[offset])
            if (command == ESC) {
                if (offset + 1 >= bytes.size) return false
                when (unsigned(bytes[offset + 1])) {
                    0x69, 0x6D -> return true
                    0x2A -> {
                        if (offset + 4 >= bytes.size) return false
                        val mode = unsigned(bytes[offset + 2])
                        val columns = unsigned(bytes[offset + 3]) +
                            unsigned(bytes[offset + 4]) * 256
                        val bytesPerColumn = if (mode == 32 || mode == 33) 3 else 1
                        val end = offset.toLong() + 5L + columns.toLong() * bytesPerColumn
                        if (end > bytes.size) return false
                        offset = end.toInt()
                        continue
                    }
                }
            } else if (command == GS) {
                if (offset + 1 >= bytes.size) return false
                when (unsigned(bytes[offset + 1])) {
                    0x56 -> return true
                    0x76 -> {
                        if (offset + 7 >= bytes.size) return false
                        if (!EscPosRasterFormat.isSupportedMode(unsigned(bytes[offset + 2]))) {
                            offset += 2
                            continue
                        }
                        val widthBytes = unsigned(bytes[offset + 4]) +
                            unsigned(bytes[offset + 5]) * 256
                        val height = unsigned(bytes[offset + 6]) +
                            unsigned(bytes[offset + 7]) * 256
                        val end = offset.toLong() + 8L + widthBytes.toLong() * height
                        if (end > bytes.size) return false
                        offset = end.toInt()
                        continue
                    }
                    0x28 -> {
                        if (offset + 4 >= bytes.size) return false
                        val payloadLength = unsigned(bytes[offset + 3]) +
                            unsigned(bytes[offset + 4]) * 256
                        val end = offset.toLong() + 5L + payloadLength
                        if (end > bytes.size) return false
                        offset = end.toInt()
                        continue
                    }
                    0x38 -> {
                        if (offset + 6 >= bytes.size) return false
                        if (unsigned(bytes[offset + 2]) != 0x4C) {
                            offset += 2
                            continue
                        }
                        val payloadLength =
                            unsigned(bytes[offset + 3]).toLong() +
                                unsigned(bytes[offset + 4]).toLong() * 256L +
                                unsigned(bytes[offset + 5]).toLong() * 65_536L +
                                unsigned(bytes[offset + 6]).toLong() * 16_777_216L
                        val end = offset.toLong() + 7L + payloadLength
                        if (end > bytes.size || end > Int.MAX_VALUE) return false
                        offset = end.toInt()
                        continue
                    }
                    0x2A -> {
                        if (offset + 3 >= bytes.size) return false
                        val widthBytes = unsigned(bytes[offset + 2])
                        val heightBytes = unsigned(bytes[offset + 3])
                        val end = offset.toLong() + 4L +
                            widthBytes.toLong() * heightBytes * 8L
                        if (end > bytes.size) return false
                        offset = end.toInt()
                        continue
                    }
                }
            }
            offset += 1
        }
        return false
    }

    private fun unsigned(value: Byte): Int = value.toInt() and 0xFF
}
