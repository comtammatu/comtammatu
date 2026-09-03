package com.comtammatu.relay

/** Shared GS v 0 header recognition, including numeric and ASCII mode bytes. */
object EscPosRasterFormat {
    const val GS = 0x1D
    const val RASTER_BIT_IMAGE = 0x76
    const val HEADER_BYTES = 8

    fun isSupportedMode(value: Int): Boolean =
        value == 0x00 || value == 0x01 || value == 0x20 || value == 0x21 ||
            value == 0x30 || value == 0x31 || value == 0x32 || value == 0x33

    fun isRasterPrefix(bytes: ByteArray, offset: Int): Boolean =
        offset + 2 < bytes.size &&
            unsigned(bytes[offset]) == GS &&
            unsigned(bytes[offset + 1]) == RASTER_BIT_IMAGE &&
            isSupportedMode(unsigned(bytes[offset + 2]))

    private fun unsigned(value: Byte): Int = value.toInt() and 0xFF
}
