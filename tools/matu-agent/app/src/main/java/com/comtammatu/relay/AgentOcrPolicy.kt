package com.comtammatu.relay

/** Pure OCR intake decisions shared by the service and unit tests. */
object AgentOcrPolicy {
    const val MAX_LONG_EDGE_PX = ReceiptOcrPreprocessor.MAX_LONG_EDGE_PX

    fun shouldRunOcr(detectedFromRaw: DeliveryPlatform?, hasRaster: Boolean): Boolean =
        detectedFromRaw == null && hasRaster

    fun scaledSize(width: Int, height: Int): Pair<Int, Int> =
        ReceiptOcrPreprocessor.targetSize(width, height)
}
