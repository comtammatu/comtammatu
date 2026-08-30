package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptDataInspectorTest {
    @Test
    fun `extracts printable receipt text without ESC POS setup commands`() {
        val raw = byteArrayOf(0x1B, 0x40) +
            "ShopeeFood\nMã đơn: 29086-503463626\nCơm sườn x1".toByteArray()

        val text = ReceiptDataInspector.extractPrintableText(raw)

        assertNotNull(text)
        assertTrue(text!!.startsWith("ShopeeFood"))
        assertTrue(text.contains("503463626"))
    }

    @Test
    fun `keeps bitmap and OCR as independent layers`() {
        val rasterReceipt = byteArrayOf(
            0x1D, 0x76, 0x30, 0x00,
            0x01, 0x00,
            0x01, 0x00,
            0x80.toByte()
        )

        val layers = ReceiptDataInspector.inspect(rasterReceipt, "ShopeeFood\nMã đơn 3626")

        assertEquals(9, layers.rawByteCount)
        assertEquals("8 × 1 px", layers.bitmapLabel)
        assertNull(layers.printableText)
        assertEquals("ShopeeFood\nMã đơn 3626", layers.ocrText)
    }

    @Test
    fun `does not invent OCR for text receipts`() {
        val layers = ReceiptDataInspector.inspect(
            "ShopeeFood\nMã đơn 3626".toByteArray(),
            null
        )

        assertNull(layers.raster)
        assertNotNull(layers.printableText)
        assertNull(layers.ocrText)
    }
}
