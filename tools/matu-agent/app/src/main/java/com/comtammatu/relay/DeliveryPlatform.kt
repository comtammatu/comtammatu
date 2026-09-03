package com.comtammatu.relay

enum class DeliveryPlatform(val wireValue: String, val displayName: String) {
    SHOPEE_FOOD("shopee", "ShopeeFood"),
    GREEN_SM_FOOD("greensm", "GreenSM Food"),
    BE_FOOD("be", "beFood")
}

object DeliveryPlatformDetector {
    private val signatures = mapOf(
        DeliveryPlatform.SHOPEE_FOOD to listOf(
            Regex("\\b(?:Shopee\\s*Food|ShopeePay|AirPay|DeliveryNow|Now\\.vn)\\b", RegexOption.IGNORE_CASE),
            Regex("\\bSPF[-_]?[0-9A-Z]+\\b", RegexOption.IGNORE_CASE)
        ),
        DeliveryPlatform.GREEN_SM_FOOD to listOf(
            Regex("\\b(?:Green\\s*SM(?:\\s*Food)?|Xanh\\s*SM|GSM|XSM)\\b", RegexOption.IGNORE_CASE),
            Regex("\\b(?:GSM|XSM|XANH)-[0-9A-Z]+\\b", RegexOption.IGNORE_CASE)
        ),
        DeliveryPlatform.BE_FOOD to listOf(
            Regex("\\b(?:be\\s*Food|beMerchant|bePay|Cake\\s+by\\s+VPBank)\\b", RegexOption.IGNORE_CASE),
            Regex("\\b(?:BE|BF)-[0-9A-Z]+\\b", RegexOption.IGNORE_CASE)
        )
    )

    fun detect(receiptText: String): DeliveryPlatform? {
        val matches = signatures.filterValues { patterns ->
            patterns.any { it.containsMatchIn(receiptText) }
        }.keys
        return matches.singleOrNull()
    }

    fun detect(rawBytes: ByteArray): DeliveryPlatform? =
        ReceiptDataInspector.extractPrintableText(rawBytes)?.let(::detect)
}
