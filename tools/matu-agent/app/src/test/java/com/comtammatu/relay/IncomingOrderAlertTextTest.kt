package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Test

class IncomingOrderAlertTextTest {
    @Test
    fun `uses the short operator reference when available`() {
        val alert = IncomingOrderAlertTextBuilder.build("ShopeeFood", "3626", 12)

        assertEquals("Đơn mới · ShopeeFood", alert.title)
        assertEquals("Mã 3626 đã được tiếp nhận. Chạm để mở sổ đối chiếu.", alert.body)
    }

    @Test
    fun `falls back to the retained queue identity`() {
        val alert = IncomingOrderAlertTextBuilder.build("ShopeeFood", null, 12)

        assertEquals("Đã nhận phiếu #12. Chạm để mở sổ đối chiếu.", alert.body)
    }
}
