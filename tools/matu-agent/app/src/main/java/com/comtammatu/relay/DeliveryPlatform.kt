package com.comtammatu.relay

enum class DeliveryPlatform(val wireValue: String, val displayName: String) {
    SHOPEE_FOOD("shopee", "ShopeeFood")
}

object DeliveryPlatformDetector {
    private val signatures = listOf(
        Regex("\\b(?:Shopee\\s*Food|ShopeePay|AirPay|DeliveryNow|Now\\.vn)\\b", RegexOption.IGNORE_CASE),
        Regex("\\bSPF[-_]?[0-9A-Z]+\\b", RegexOption.IGNORE_CASE)
    )

    fun detect(receiptText: String): DeliveryPlatform? =
        if (signatures.any { it.containsMatchIn(receiptText) }) {
            DeliveryPlatform.SHOPEE_FOOD
        } else {
            null
        }

    fun detect(rawBytes: ByteArray): DeliveryPlatform? =
        ReceiptDataInspector.extractPrintableText(rawBytes)?.let(::detect)
}
