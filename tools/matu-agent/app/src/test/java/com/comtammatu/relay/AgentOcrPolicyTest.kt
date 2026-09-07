package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentOcrPolicyTest {
    @Test
    fun `runs OCR only when the raw stream is unclassified and has a raster`() {
        assertTrue(AgentOcrPolicy.shouldRunOcr(detectedFromRaw = null, hasRaster = true))
        assertFalse(AgentOcrPolicy.shouldRunOcr(DeliveryPlatform.SHOPEE_FOOD, hasRaster = true))
        assertFalse(AgentOcrPolicy.shouldRunOcr(detectedFromRaw = null, hasRaster = false))
        assertFalse(AgentOcrPolicy.shouldRunOcr(DeliveryPlatform.SHOPEE_FOOD, hasRaster = false))
    }

    @Test
    fun `upsizes typical thermal rasters and caps a very tall one`() {
        assertEquals(1152 to 1600, AgentOcrPolicy.scaledSize(576, 800))
        val tall = AgentOcrPolicy.scaledSize(384, 1200)
        assertTrue(tall.second <= AgentOcrPolicy.MAX_LONG_EDGE_PX)

        val scaled = AgentOcrPolicy.scaledSize(576, 4000)
        assertTrue(scaled.first < 576)
        assertEquals(AgentOcrPolicy.MAX_LONG_EDGE_PX, scaled.second)
    }

    @Test
    fun `caps an oversized long edge even when width is already narrow`() {
        val scaled = AgentOcrPolicy.scaledSize(384, 5000)
        assertTrue(scaled.first <= 384)
        assertEquals(AgentOcrPolicy.MAX_LONG_EDGE_PX, scaled.second)
    }
}
