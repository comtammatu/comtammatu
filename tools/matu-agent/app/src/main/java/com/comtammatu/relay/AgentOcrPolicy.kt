package com.comtammatu.relay

import kotlin.math.max
import kotlin.math.roundToInt

/** Pure OCR intake decisions shared by the service and unit tests. */
object AgentOcrPolicy {
    const val MAX_LONG_EDGE_PX = 1600

    fun shouldRunOcr(detectedFromRaw: DeliveryPlatform?, hasRaster: Boolean): Boolean =
        detectedFromRaw == null && hasRaster

    fun scaledSize(width: Int, height: Int): Pair<Int, Int> {
        if (width <= 0 || height <= 0) return width.coerceAtLeast(0) to height.coerceAtLeast(0)
        val longEdge = max(width, height)
        if (longEdge <= MAX_LONG_EDGE_PX) return width to height
        val scale = MAX_LONG_EDGE_PX.toDouble() / longEdge.toDouble()
        return (width * scale).roundToInt().coerceAtLeast(1) to
            (height * scale).roundToInt().coerceAtLeast(1)
    }
}
