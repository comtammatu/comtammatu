package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptOcrPreprocessorTest {
    @Test
    fun `upsizes a typical 576 px thermal receipt`() {
        assertEquals(2.0, ReceiptOcrPreprocessor.scaleFactor(576, 800), 0.001)
        assertEquals(1152 to 1600, ReceiptOcrPreprocessor.targetSize(576, 800))
    }

    @Test
    fun `caps a very tall raster so ML Kit stays bounded`() {
        val scaled = ReceiptOcrPreprocessor.targetSize(576, 4000)
        assertEquals(ReceiptOcrPreprocessor.MAX_LONG_EDGE_PX, scaled.second)
        assertTrue(scaled.first < 576)
    }

    @Test
    fun `pads tone-mark space then thickens isolated pixels`() {
        val source = ByteArray(3 * 3)
        source[4] = 1
        val padded = ReceiptOcrPreprocessor.padToneMarks(3, 3, source)
        assertEquals(3, padded.width)
        assertEquals(3 + ReceiptOcrPreprocessor.TONE_PAD_PX * 2, padded.height)
        val dilated = ReceiptOcrPreprocessor.dilate(3, 3, source)
        assertEquals(9, dilated.blackPixels.count { it.toInt() == 1 })
    }

    @Test
    fun `prepare grows a narrow receipt past the Vietnamese min width without thickening`() {
        val pixels = ByteArray(384 * 200)
        pixels[50] = 1
        val prepared = ReceiptOcrPreprocessor.prepare(384, 200, pixels)
        assertTrue(prepared.width >= ReceiptOcrPreprocessor.MIN_WIDTH_PX)
        assertTrue(prepared.height > 200)
        val sourceBlack = pixels.count { it.toInt() == 1 }
        val preparedBlack = prepared.blackPixels.count { it.toInt() == 1 }
        assertTrue(preparedBlack >= sourceBlack)
        assertTrue(preparedBlack <= sourceBlack * 9)
    }
}
