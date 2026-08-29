package com.comtammatu.relay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OperatorErrorFormatterTest {
    @Test
    fun `explains invalid receipt errors with the manual-entry recovery`() {
        assertEquals(
            "Phiếu thiếu mã đơn hoặc món hợp lệ. Nếu thu ngân đã nhập tay, chọn “Đã nhập tay” để loại khỏi hàng chờ.",
            OperatorErrorFormatter.format("HTTP 422: Thiếu dữ liệu đơn hoặc hoá đơn không có món hợp lệ")
        )
    }

    @Test
    fun `does not expose an unknown server response`() {
        assertEquals(
            "Chưa chuyển được đơn lên POS. Kiểm tra kết nối; Agent sẽ tự gửi lại.",
            OperatorErrorFormatter.format("HTTP 500: stack trace and internal table name")
        )
    }

    @Test
    fun `keeps an empty error absent`() {
        assertNull(OperatorErrorFormatter.format(null))
    }
}
