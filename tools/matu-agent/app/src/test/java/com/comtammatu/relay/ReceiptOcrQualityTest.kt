package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptOcrQualityTest {
    @Test
    fun `scores a complete Vietnamese Shopee receipt higher than a defective OCR dump`() {
        val good = ReceiptOcrQuality.score(
            """
                ShopeeFood
                Mã đơn hàng: 07096-766851190
                1x Sườn Cốt Lết 87.000
                + Trứng
            """.trimIndent()
        )
        val bad = ReceiptOcrQuality.score(
            """
                ShopeeFood
                Cơm Tấm Mả Tư
                Mā dơn hàng: O7096-766851190
                1x Cdm Suon Cot Let 87.000
                + iring
                Tống tiền 36.000d
            """.trimIndent()
        )
        assertTrue(good.hasShopee)
        assertTrue(good.hasOrderRef)
        assertTrue(good.completion > bad.completion)
        assertTrue(bad.defectCount >= 4)
        assertEquals(0, good.defectCount)
    }

    @Test
    fun `empty OCR is zero completion`() {
        assertEquals(0, ReceiptOcrQuality.score(null).completion)
        assertEquals(0, ReceiptOcrQuality.score("").completion)
    }
}
