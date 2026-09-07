package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OcrBenchmarkTest {
    @Test
    fun `summarizes completion and latency across stored receipts`() {
        val good = ReceiptOcrQuality.score(
            """
                ShopeeFood
                Mã đơn hàng: 07096-766851190
                1x Sườn Cốt Lết
            """.trimIndent()
        )
        val weak = ReceiptOcrQuality.score("Cdm iring")
        val samples = listOf(
            OcrEngineSample(ReceiptTextRecognizer.ENGINE_MLKIT_PREPROCESS, 120, good, good, "ok", "ok"),
            OcrEngineSample(ReceiptTextRecognizer.ENGINE_MLKIT_PREPROCESS, 180, weak, weak, "bad", "bad")
        )
        val summary = OcrBenchmark.summarize(ReceiptTextRecognizer.ENGINE_MLKIT_PREPROCESS, samples)
        assertEquals(2, summary.getInt("receiptCount"))
        assertEquals(150.0, summary.getDouble("meanElapsedMs"), 0.001)
        assertEquals(0.5, summary.getDouble("orderRefRate"), 0.001)
        assertTrue(summary.getDouble("meanCompletion") > 0)
    }
}
