package com.comtammatu.relay

data class ReceiptOcrScore(
    val hasShopee: Boolean,
    val hasOrderRef: Boolean,
    val diacriticCount: Int,
    val defectCount: Int,
    val menuHitCount: Int,
    val completion: Int
)

/** Scores OCR text for ShopeeFood Vietnamese receipts without calling an OCR engine. */
object ReceiptOcrQuality {
    private val defectPatterns = listOf(
        Regex("iring", RegexOption.IGNORE_CASE),
        Regex("\\bCdm\\b", RegexOption.IGNORE_CASE),
        Regex("Cơmn", RegexOption.IGNORE_CASE),
        Regex("Mā\\s*dơn", RegexOption.IGNORE_CASE),
        Regex("Mả\\s*Tư", RegexOption.IGNORE_CASE),
        Regex("Tống\\s*tiền", RegexOption.IGNORE_CASE),
        Regex("Giảm\\s*giả", RegexOption.IGNORE_CASE),
        Regex("mnỡ", RegexOption.IGNORE_CASE),
        Regex("Tóp\\s*mở", RegexOption.IGNORE_CASE),
        Regex("ăn\\s*uớng", RegexOption.IGNORE_CASE),
        Regex("Chiết\\s*khẩu", RegexOption.IGNORE_CASE),
        Regex("\\bO\\d{4}-"),
        Regex("\\bCom\\s+thêm", RegexOption.IGNORE_CASE),
        Regex("000dđ", RegexOption.IGNORE_CASE)
    )
    private val menuNeedles = listOf(
        "sườn cốt lết",
        "sườn cọng",
        "sườn một gang",
        "cơm tấm bì",
        "canh khổ qua",
        "canh chua tôm",
        "trà tắc",
        "nước sâm",
        "nước cam",
        "rau má",
        "trứng",
        "chả",
        "tóp mỡ",
        "cơm thêm"
    )

    fun score(text: String?): ReceiptOcrScore {
        if (text.isNullOrBlank()) {
            return ReceiptOcrScore(false, false, 0, 0, 0, 0)
        }
        val hasShopee = DeliveryPlatformDetector.detect(text) == DeliveryPlatform.SHOPEE_FOOD
        val hasOrderRef = !OrderIdentity.extractSourceOrderRef(text).isNullOrBlank()
        val diacriticCount = text.count(::isVietnameseDiacritic)
        val defectCount = defectPatterns.sumOf { pattern -> pattern.findAll(text).count() }
        val folded = text.lowercase()
        val menuHitCount = menuNeedles.count { needle -> folded.contains(needle) }
        val completion = (
            (if (hasOrderRef) 40 else 0) +
                (if (hasShopee) 20 else 0) +
                diacriticCount.coerceAtMost(20) +
                (menuHitCount * 5).coerceAtMost(20) -
                (defectCount * 5).coerceAtMost(20)
            ).coerceIn(0, 100)
        return ReceiptOcrScore(
            hasShopee = hasShopee,
            hasOrderRef = hasOrderRef,
            diacriticCount = diacriticCount,
            defectCount = defectCount,
            menuHitCount = menuHitCount,
            completion = completion
        )
    }

    private fun isVietnameseDiacritic(char: Char): Boolean {
        if (char == 'đ' || char == 'Đ') return true
        val decomposed = java.text.Normalizer.normalize(char.toString(), java.text.Normalizer.Form.NFD)
        return decomposed.length > 1 && decomposed.any { Character.getType(it) == Character.NON_SPACING_MARK.toInt() }
    }
}
