package com.comtammatu.relay

import java.security.MessageDigest
import java.util.Locale

/** Stable identities used to prevent a printed delivery receipt from being queued twice. */
object OrderIdentity {
    private val orderLabel = Regex(
        "^(?:Mã\\s*đơn(?:\\s*hàng)?|Mã\\s*đặt\\s*món|Order\\s*ID)\\s*:?\\s*#?\\s*(.*)$",
        RegexOption.IGNORE_CASE
    )
    private val orderCode = Regex("^(?=.*\\d)[A-Z0-9_-]{5,}$", RegexOption.IGNORE_CASE)

    fun extractSourceOrderRef(receiptText: String?): String? {
        if (receiptText.isNullOrBlank()) return null

        val lines = receiptText.lineSequence().map(String::trim).filter(String::isNotBlank).toList()
        for ((index, line) in lines.withIndex()) {
            val labelMatch = orderLabel.matchEntire(line) ?: continue
            val inlineValue = labelMatch.groupValues[1].trim()
            val candidate = inlineValue.ifBlank { lines.getOrNull(index + 1).orEmpty() }
                .trim()
                .trimStart('#')
                .trim()
            if (orderCode.matches(candidate)) {
                return candidate.uppercase(Locale.ROOT)
            }
        }
        return null
    }

    fun displaySourceOrderRef(platform: String, sourceOrderRef: String?): String? {
        if (sourceOrderRef.isNullOrBlank()) return null
        if (platform != DeliveryPlatform.SHOPEE_FOOD.wireValue) return sourceOrderRef

        val numericSuffix = sourceOrderRef.substringAfterLast('-', missingDelimiterValue = "")
        return if (numericSuffix.length >= 4 && numericSuffix.all(Char::isDigit)) {
            numericSuffix.takeLast(4)
        } else {
            sourceOrderRef
        }
    }

    fun fingerprint(rawBytes: ByteArray): String = MessageDigest
        .getInstance("SHA-256")
        .digest(rawBytes)
        .joinToString("") { byte -> "%02x".format(byte) }
}
