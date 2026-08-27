package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Test

class DeliveryPlatformDetectorTest {
    @Test
    fun `detects the three supported delivery platforms`() {
        assertEquals(
            DeliveryPlatform.SHOPEE_FOOD,
            DeliveryPlatformDetector.detect("ShopeeFood\nMã đơn: SPF-123")
        )
        assertEquals(
            DeliveryPlatform.GREEN_SM_FOOD,
            DeliveryPlatformDetector.detect("GreenSM Food\nMã đơn: GSM-456")
        )
        assertEquals(
            DeliveryPlatform.BE_FOOD,
            DeliveryPlatformDetector.detect("Be Food\nMã đơn: BE-789")
        )
    }

    @Test
    fun `fails closed for unknown or conflicting receipt signatures`() {
        assertEquals(null, DeliveryPlatformDetector.detect("Phiếu giao hàng\nMã đơn: 123456"))
        assertEquals(
            null,
            DeliveryPlatformDetector.detect("ShopeeFood\nGreenSM Food\nMã đơn: SPF-GSM-1")
        )
    }
}
