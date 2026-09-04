package com.comtammatu.relay

import java.text.Normalizer
import java.security.MessageDigest
import java.util.Locale

/** Stable identities used to prevent a printed delivery receipt from being queued twice. */
object OrderIdentity {
    private val labeledLine = Regex(
        "(?:^|\\s)(?:ma\\s*don(?:\\s*hang)?|ma\\s*dat\\s*mon|order\\s*id)\\s*:?\\s*#?\\s*(.*)$",
        RegexOption.IGNORE_CASE
    )
    private val orderCode = Regex("^(?=.*\\d)[A-Z0-9-]{5,}$", RegexOption.IGNORE_CASE)
    private val bareNumeric = Regex("\\b([O0]?\\d{4,6}-\\d{6,})\\b", RegexOption.IGNORE_CASE)
    private val spfCode = Regex("\\b(SPF[-_]?[0-9A-Z]+)\\b", RegexOption.IGNORE_CASE)
    private val leadingOcrO = Regex("^O(?=\\d{4}-)", RegexOption.IGNORE_CASE)

    fun extractSourceOrderRef(receiptText: String?): String? {
        if (receiptText.isNullOrBlank()) return null

        val lines = receiptText.lineSequence().map(String::trim).filter(String::isNotBlank).toList()
        var labeled: String? = null
        var bare: String? = null
        var spf: String? = null

        for ((index, line) in lines.withIndex()) {
            if (labeled == null) {
                val labelMatch = labeledLine.find(foldVi(line))
                if (labelMatch != null) {
                    val inline = labelMatch.groupValues[1].trim()
                    val candidate = if (inline.isNotBlank()) {
                        firstToken(inline)
                    } else {
                        lines.getOrNull(index + 1)?.let(::firstToken)
                    }
                    labeled = acceptOrderCode(candidate)
                }
            }
            if (bare == null) {
                bare = acceptOrderCode(bareNumeric.find(line)?.groupValues?.get(1))
            }
            if (spf == null) {
                spf = spfCode.find(line)?.groupValues?.get(1)
                    ?.uppercase(Locale.ROOT)
                    ?.replace('_', '-')
            }
        }

        return labeled ?: bare ?: spf
    }

    fun displaySourceOrderRef(platform: String, sourceOrderRef: String?): String? {
        if (sourceOrderRef.isNullOrBlank()) return null
        if (platform != DeliveryPlatform.SHOPEE_FOOD.wireValue) return sourceOrderRef

        val canonical = canonicalize(sourceOrderRef)
        val numericSuffix = canonical.substringAfterLast('-', missingDelimiterValue = "")
        return if (numericSuffix.length >= 4 && numericSuffix.all(Char::isDigit)) {
            numericSuffix.takeLast(4)
        } else if (canonical.length == 4 && canonical.all(Char::isDigit)) {
            canonical
        } else {
            sourceOrderRef
        }
    }

    fun operatorVisibleOrderRef(
        platform: String,
        sourceOrderRef: String?,
        posDisplayId: String?
    ): String? = displaySourceOrderRef(platform, sourceOrderRef)
        ?: displaySourceOrderRef(platform, posDisplayId)

    fun fingerprint(rawBytes: ByteArray): String = MessageDigest
        .getInstance("SHA-256")
        .digest(rawBytes)
        .joinToString("") { byte -> "%02x".format(byte) }

    internal fun canonicalize(ref: String): String =
        ref.trim().replace('_', '-').replace(leadingOcrO, "0")

    private fun firstToken(value: String): String =
        value.trim().trimStart('#').split(Regex("\\s+")).firstOrNull().orEmpty()

    private fun acceptOrderCode(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val canonical = canonicalize(raw)
        return canonical.takeIf { orderCode.matches(it) }
    }

    private fun foldVi(value: String): String = Normalizer
        .normalize(value, Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .replace('đ', 'd')
        .replace('Đ', 'd')
        .lowercase(Locale.ROOT)
}
