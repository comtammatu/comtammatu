package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShopeeReceiptPipelineTest {
    @Test
    fun `plans OCR when the raw stream has a raster and no Shopee text`() {
        val raster = byteArrayOf(
            0x1B, 0x40,
            0x1D, 0x76, 0x30, 0x00,
            0x04, 0x00, 0x01, 0x00,
            0x00, 0x00, 0x00, 0x00
        )

        val plan = ShopeeReceiptPipeline.plan(raster)
        assertNull(plan.rawPlatform)
        assertTrue(plan.shouldRunOcr)
    }

    @Test
    fun `skips OCR when printable Shopee text is already present`() {
        val raw = byteArrayOf(0x1B, 0x40) + "ShopeeFood\nSPF-123".toByteArray()
        val plan = ShopeeReceiptPipeline.plan(raw)
        assertEquals(DeliveryPlatform.SHOPEE_FOOD, plan.rawPlatform)
        assertFalse(plan.shouldRunOcr)
    }

    @Test
    fun `classifies from OCR when the raw stream was unclassified`() {
        val result = ShopeeReceiptPipeline.finish(
            rawPlatform = null,
            ocrText = "ShopeeFood\nMã đơn: 07096-766851190"
        )
        assertEquals(DeliveryPlatform.SHOPEE_FOOD, result.platform)
        assertEquals("ShopeeFood\nMã đơn: 07096-766851190", result.receiptText)
    }

    @Test
    fun `keeps an unknown OCR receipt unclassified`() {
        val result = ShopeeReceiptPipeline.finish(
            rawPlatform = null,
            ocrText = "Phiếu giao hàng\nMã đơn: 123456"
        )
        assertNull(result.platform)
    }
}
