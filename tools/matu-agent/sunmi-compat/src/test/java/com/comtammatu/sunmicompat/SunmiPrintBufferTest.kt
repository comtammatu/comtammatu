package com.comtammatu.sunmicompat

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SunmiPrintBufferTest {
    @Test
    fun `keeps multiple committed lines in one receipt until the job boundary`() {
        val buffer = SunmiPrintBuffer(maxPayloadBytes = 128)

        assertTrue(buffer.appendText("GreenSM Food\n"))
        buffer.markCommittedLine()
        assertTrue(buffer.appendText("GSM-12345\n"))
        buffer.markCommittedLine()

        assertArrayEquals(
            "GreenSM Food\nGSM-12345\n".toByteArray() +
                byteArrayOf(0x1D, 0x56, 0x41, 0x00),
            buffer.drainReceipt(includeCut = true)
        )
        assertNull(buffer.drainReceipt(includeCut = true))
    }

    @Test
    fun `rejects an oversized write without corrupting the current receipt`() {
        val buffer = SunmiPrintBuffer(maxPayloadBytes = 12)

        assertTrue(buffer.appendText("beFood\n"))
        assertFalse(buffer.appendRaw(ByteArray(8) { 0x41 }))

        assertArrayEquals("beFood\n".toByteArray(), buffer.drainReceipt(includeCut = false))
    }

    @Test
    fun `encodes monochrome pixels as an ESC POS raster`() {
        val pixels = intArrayOf(
            0xFF000000.toInt(), 0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0xFFFFFFFF.toInt(),
            0xFF000000.toInt(), 0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0xFFFFFFFF.toInt(),
            0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0xFFFFFFFF.toInt(), 0xFF000000.toInt(),
            0xFFFFFFFF.toInt(), 0xFF000000.toInt(), 0xFFFFFFFF.toInt(), 0xFF000000.toInt()
        )

        assertArrayEquals(
            byteArrayOf(
                0x1D, 0x76, 0x30, 0x00,
                0x01, 0x00, 0x02, 0x00,
                0xAA.toByte(), 0x55
            ),
            EscPosRasterEncoder.encode(width = 8, height = 2, argb = pixels)
        )
    }
}
