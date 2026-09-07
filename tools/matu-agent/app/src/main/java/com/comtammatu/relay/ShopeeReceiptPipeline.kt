package com.comtammatu.relay

data class ShopeeOcrPlan(
    val rawPlatform: DeliveryPlatform?,
    val shouldRunOcr: Boolean
)

data class ShopeeReceiptClassification(
    val platform: DeliveryPlatform?,
    val receiptText: String?
)

/**
 * ShopeeFood intake decisions: detect from ESC/POS text when present, otherwise
 * run on-device OCR on the raster and classify the normalized text.
 */
object ShopeeReceiptPipeline {
    fun plan(rawBytes: ByteArray): ShopeeOcrPlan {
        val rawPlatform = DeliveryPlatformDetector.detect(rawBytes)
        return ShopeeOcrPlan(
            rawPlatform = rawPlatform,
            shouldRunOcr = AgentOcrPolicy.shouldRunOcr(
                rawPlatform,
                EscPosRasterDecoder.hasDecodableRaster(rawBytes)
            )
        )
    }

    fun finish(
        rawPlatform: DeliveryPlatform?,
        ocrText: String?
    ): ShopeeReceiptClassification {
        val platform = rawPlatform ?: ocrText?.let(DeliveryPlatformDetector::detect)
        return ShopeeReceiptClassification(
            platform = platform,
            receiptText = ocrText
        )
    }
}
