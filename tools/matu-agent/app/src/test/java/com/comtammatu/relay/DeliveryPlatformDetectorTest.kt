package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Test

class DeliveryPlatformDetectorTest {
    @Test
    fun `detects ShopeeFood receipts only`() {
        assertEquals(
            DeliveryPlatform.SHOPEE_FOOD,
            DeliveryPlatformDetector.detect("ShopeeFood\nMã đơn: SPF-123")
        )
        assertEquals(
            DeliveryPlatform.SHOPEE_FOOD,
            DeliveryPlatformDetector.detect("Thanh toán: ShopeePay\nSPF-8891")
        )
    }

    @Test
    fun `fails closed for unknown receipts`() {
        assertEquals(null, DeliveryPlatformDetector.detect("Phiếu giao hàng\nMã đơn: 123456"))
        assertEquals(null, DeliveryPlatformDetector.detect("Đơn mạng\nMã đơn: ABC-456"))
    }

    @Test
    fun `does not treat accidental ASCII inside a raster payload as ShopeeFood`() {
        val rasterWithSpfLikeBytes = byteArrayOf(
            0x1B, 0x40,
            0x1D, 0x76, 0x30, 0x00,
            0x04, 0x00, 0x01, 0x00,
            'S'.code.toByte(),
            'P'.code.toByte(),
            'F'.code.toByte(),
            '-'.code.toByte()
        )

        assertEquals(null, DeliveryPlatformDetector.detect(rasterWithSpfLikeBytes))
        assertEquals(
            DeliveryPlatform.SHOPEE_FOOD,
            DeliveryPlatformDetector.detect(
                byteArrayOf(0x1B, 0x40) + "ShopeeFood\nSPF-123".toByteArray()
            )
        )
    }
}
