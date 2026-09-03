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
        assertFalse(AgentOcrPolicy.shouldRunOcr(DeliveryPlatform.BE_FOOD, hasRaster = false))
    }

    @Test
    fun `shrinks tall thermal rasters before ML Kit`() {
        assertEquals(576 to 800, AgentOcrPolicy.scaledSize(576, 800))
        assertEquals(384 to 1200, AgentOcrPolicy.scaledSize(384, 1200))

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
