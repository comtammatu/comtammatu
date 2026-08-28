package com.comtammatu.relay

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EscPosRasterDecoderTest {
    @Test
    fun `decodes monochrome raster image payload`() {
        val receipt = byteArrayOf(
            0x1B, 0x40,
            0x1D, 0x76, 0x30, 0x00,
            0x01, 0x00,
            0x02, 0x00,
            0b1010_0000.toByte(),
            0b0101_0000.toByte(),
            0x1D, 0x56, 0x00
        )

        val raster = EscPosRasterDecoder.decodeLargest(receipt)

        requireNotNull(raster)
        assertEquals(8, raster.width)
        assertEquals(2, raster.height)
        assertArrayEquals(
            byteArrayOf(
                1, 0, 1, 0, 0, 0, 0, 0,
                0, 1, 0, 1, 0, 0, 0, 0
            ),
            raster.blackPixels
        )
    }

    @Test
    fun `rejects truncated and implausibly large raster payloads`() {
        assertNull(
            EscPosRasterDecoder.decodeLargest(
                byteArrayOf(0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x02, 0x00, 0x01)
            )
        )
        assertNull(
            EscPosRasterDecoder.decodeLargest(
                byteArrayOf(0x1D, 0x76, 0x30, 0x00, 0xFF.toByte(), 0x7F, 0xFF.toByte(), 0x7F)
            )
        )
    }
}
