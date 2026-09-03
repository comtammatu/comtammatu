package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptOcrNormalizerTest {
    @Test
    fun `rebuilds receipt rows from OCR geometry`() {
        val lines = listOf(
            OcrPositionedLine("43.007d", 292, 402, 376, 422),
            OcrPositionedLine("Mã đơn hàng", 8, 80, 180, 101),
            OcrPositionedLine("Tổng tiền", 8, 400, 150, 423),
            OcrPositionedLine("27086-852220336", 8, 110, 220, 132),
            OcrPositionedLine("x2", 185, 250, 220, 271),
            OcrPositionedLine("114.000d", 292, 249, 377, 272)
        )

        assertEquals(
            "Mã đơn hàng\n27086-852220336\nx2 114.000d\nTổng tiền 43.007d",
            ReceiptOcrLayout.rebuild(lines)
        )
    }

    @Test
    fun `normalizes raster receipt into legacy parser compatible lines`() {
        val layoutText = """
            ShopeeFood
            Mã đơn hàng
            27086-852220336
            Món Tổng tiền Giá
            1. Cơm Sườn Cốt Lết
            • 1xCanh theo ngày
            • 1xDụng cụ ăn uống
            x2 114.000d
            cắt sườn giúp em
            Tổng món 2
            Tổng tiển món (giá gốc) 114.000d
            Chiết khấu -20.000d
            Tổng tiển 94.000d
        """.trimIndent()

        val normalized = RasterReceiptTextNormalizer.normalize(layoutText)

        assertTrue(normalized.contains("Mã đơn hàng: 27086-852220336"))
        assertTrue(normalized.contains("2x Sườn Cốt Lết 114.000"))
        assertTrue(normalized.contains("+ Canh theo ngày"))
        assertTrue(normalized.contains("+ Dụng cụ ăn uống"))
        assertTrue(normalized.contains("Ghi chú: cắt sườn giúp em"))
        assertTrue(normalized.contains("Tổng tiền 94.000d"))
    }

    @Test
    fun `repairs common OCR substitutions in order labels items and prices`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mā đơn hàng
                27086-698465644
                2. Cdm Sườn Cốt Lết
                • 1xChà
                X1 69.000g
                Tổng món 1
            """.trimIndent()
        )

        assertTrue(normalized.contains("Mã đơn hàng: 27086-698465644"))
        assertTrue(normalized.contains("1x Sườn Cốt Lết 69.000"))
        assertTrue(normalized.contains("+ Chà"))
    }

    @Test
    fun `does not invent a menu name for extra rice`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mã đơn hàng
                25086-333333333
                1. Cơm thêm
                X1 6.000d
                Tổng món 1
            """.trimIndent()
        )

        assertTrue(normalized.contains("1x Cơm thêm 6.000"))
        assertTrue(!normalized.contains("Cơm Tấm Thêm"))
    }

    @Test
    fun `repairs the extra-n OCR typo in extra rice without inventing a dish`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mã đơn hàng
                25086-333333336
                1. Cơmn thêm
                X1 6.000d
                Tổng món 1
            """.trimIndent()
        )

        assertTrue(normalized.contains("1x Cơm thêm 6.000"))
        assertTrue(!normalized.contains("Cơmn"))
        assertTrue(!normalized.contains("Cơm Tấm Thêm"))
    }

    @Test
    fun `accepts a detached item price when OCR drops the quantity marker`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mã đơn hàng
                25086-406669502
                1. Cơm Sườn Cốt Lết
                • 1xTrűng
                • 1xCanh chua tôm
                • 1xDụng cụ ăn uống
                97.000d
                Tổng món 1
            """.trimIndent()
        )

        assertTrue(normalized.contains("1x Sườn Cốt Lết 97.000"))
        assertTrue(normalized.contains("+ Trűng"))
        assertTrue(normalized.contains("1x Canh Chua Tôm 1"))
        assertTrue(!normalized.contains("+ Canh chua tôm"))
        assertTrue(!normalized.contains("Ghi chú: Tùy chọn: Canh Chua Tôm"))
    }

    @Test
    fun `keeps daily soup as an option but promotes named soups to POS items`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mã đơn hàng
                25086-000000001
                1. Cơm Sườn Cốt Lết
                • 1xCanh theo ngày
                • 1xCanh Khổ Qua
                X1 84.000d
                Tổng món 1
            """.trimIndent()
        )

        assertTrue(normalized.contains("+ Canh theo ngày"))
        assertTrue(normalized.contains("1x Canh Khổ Qua 1"))
        assertTrue(!normalized.contains("Ghi chú: Tùy chọn: Canh Khổ Qua"))
    }

    @Test
    fun `repairs the duplicated accent OCR error in kumquat tea`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mã đơn hàng
                28086-616906507
                1. Trà Tắấc
                X1 20.000d
                Tổng món 1
            """.trimIndent()
        )

        assertTrue(normalized.contains("1x Trà Tắc 20.000"))
    }

    @Test
    fun `keeps the customer kitchen note and ignores OCR settlement footer`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mã đơn hàng
                27086-730200001
                1. Cơm Sườn Cốt Lết
                • IxDụng cụ ăn uống
                X1 54.000d
                Tổng mớn 2
                Tổng tiền món (giá gốc) 82.000d
                Giảm giả mồn -27.000d
                Chiết khấu -15.703d
                Ghi chủ của khách hàng Nước mắm không cay giúp em
                Tổng tiền 39.298d
            """.trimIndent()
        )

        assertTrue(normalized.contains("1x Sườn Cốt Lết 54.000"))
        assertTrue(normalized.contains("+ Dụng cụ ăn uống"))
        assertTrue(normalized.contains("Ghi chú: Nước mắm không cay giúp em"))
        assertTrue(!normalized.contains("Ghi chú: Tổng"))
        assertTrue(!normalized.contains("Ghi chú: Chiết"))
    }

    @Test
    fun `keeps the pickle tomato oil note and drops a glued Tong mon footer`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                ShopeeFood
                Mã đơn hàng
                29086-503463626
                1. Cơm Sườn Cốt Lết
                X1 54.000d
                Ghi chú: Không lấy đồ chua xin nhiều cà chu a mỡ hành Tổng mớón
            """.trimIndent()
        )

        assertTrue(normalized.contains("Ghi chú: Không lấy đồ chua xin nhiều cà chua mỡ hành"))
        assertTrue(!normalized.contains("Tổng mớón"))
        assertTrue(!normalized.contains("Ghi chú: Ghi chú"))
    }

    @Test
    fun `normalizes Green SM raster quantity rows without absorbing receipt totals`() {
        val normalized = RasterReceiptTextNormalizer.normalize(
            """
                XANH SM NGON
                Mã đơn hàng
                GSM-829173
                1. Cơm Sườn Cốt Lết
                • 1xTrứng
                2 x 114.000d
                Tổng cộng 114.000d
            """.trimIndent()
        )

        assertTrue(normalized.contains("Mã đơn hàng: GSM-829173"))
        assertTrue(normalized.contains("2x Sườn Cốt Lết 114.000"))
        assertTrue(normalized.contains("+ Trứng"))
        assertTrue(!normalized.contains("Ghi chú: Tổng cộng"))
    }
}
