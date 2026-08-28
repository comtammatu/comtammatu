package com.comtammatu.relay

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EscPosPrinterProtocolTest {
    @Test
    fun `answers real-time status queries even when commands span TCP chunks`() {
        val responder = EscPosStatusResponder()

        assertArrayEquals(byteArrayOf(), responder.responsesFor(byteArrayOf(0x10, 0x04)))
        assertArrayEquals(byteArrayOf(0x12), responder.responsesFor(byteArrayOf(0x01)))
        assertArrayEquals(
            byteArrayOf(0x12, 0x12, 0x12),
            responder.responsesFor(
                byteArrayOf(
                    0x10, 0x04, 0x02,
                    0x10, 0x04, 0x03,
                    0x10, 0x04, 0x04
                )
            )
        )
        assertArrayEquals(byteArrayOf(), responder.responsesFor(byteArrayOf(0x1D, 0x72)))
        assertArrayEquals(byteArrayOf(0x00), responder.responsesFor(byteArrayOf(0x01)))
        assertArrayEquals(
            byteArrayOf(0x10, 0x00, 0x00, 0x00),
            responder.responsesFor(byteArrayOf(0x1D, 0x61, 0x0E))
        )
    }

    @Test
    fun `recognizes status-only probes so they are not queued as receipts`() {
        assertTrue(
            EscPosStatusResponder.isStatusOnly(
                byteArrayOf(
                    0x10, 0x04, 0x01,
                    0x10, 0x04, 0x04,
                    0x1D, 0x72, 0x01,
                    0x1D, 0x61, 0x0E
                )
            )
        )
        assertFalse(
            EscPosStatusResponder.isStatusOnly(
                byteArrayOf(0x10, 0x04, 0x01) + "ShopeeFood".toByteArray()
            )
        )
    }

    @Test
    fun `does not treat cut-like bytes inside raster data as receipt terminator`() {
        val rasterWithCutLikeBytes = byteArrayOf(
            0x1D, 0x76, 0x30, 0x00,
            0x04, 0x00, 0x01, 0x00,
            0x41, 0x1D, 0x56, 0x42
        )

        assertFalse(EscPosReceiptBoundary.hasCutCommand(rasterWithCutLikeBytes))
        assertTrue(
            EscPosReceiptBoundary.hasCutCommand(
                rasterWithCutLikeBytes + byteArrayOf(0x1D, 0x56, 0x41, 0x00)
            )
        )
    }

    @Test
    fun `waits for a complete raster block before recognizing a following cut`() {
        val partialRaster = byteArrayOf(
            0x1D, 0x76, 0x30, 0x00,
            0x04, 0x00, 0x01, 0x00,
            0x41, 0x1D
        )

        assertFalse(EscPosReceiptBoundary.hasCutCommand(partialRaster))
    }
}
