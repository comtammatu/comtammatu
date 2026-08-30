package com.comtammatu.relay

/** Converts transport and relay failures into an operator action without exposing raw payloads. */
object OperatorErrorFormatter {
    fun format(error: String?): String? {
        if (error.isNullOrBlank()) return null
        val normalized = error.lowercase()
        return when {
            "thiếu dữ liệu đơn" in normalized ||
                "hóa đơn không có món hợp lệ" in normalized ||
                "hoá đơn không có món hợp lệ" in normalized ->
                "Phiếu thiếu mã đơn hoặc món hợp lệ. Nếu thu ngân đã nhập tay, chọn “Đã nhập tay” để loại khỏi hàng chờ."
            "401" in normalized || "relay secret" in normalized ->
                "Mã bí mật kết nối POS chưa đúng. Kiểm tra cấu hình rồi gửi lại."
            "món đã bị tắt bán" in normalized ->
                "Có món đang bị tắt bán trong ngày. Xác nhận lại với bếp, bật bán rồi chọn “Gửi lại ngay”, hoặc nhập tay và đánh dấu đã xử lý."
            "món đã hết suất" in normalized ->
                "Có món đã hết suất hôm nay. Điều chỉnh suất bán rồi chọn “Gửi lại ngay”, hoặc nhập tay và đánh dấu đã xử lý."
            "thiếu giá kênh" in normalized ->
                "Có món chưa có giá kênh giao hàng. Cập nhật giá kênh rồi chọn “Gửi lại ngay”."
            "timed out" in normalized || "timeout" in normalized ->
                "POS chưa phản hồi kịp. Agent sẽ tự gửi lại."
            "unable to resolve host" in normalized || "connection refused" in normalized ->
                "Không kết nối được POS. Kiểm tra mạng và địa chỉ máy chủ."
            Regex("http 4\\d\\d").containsMatchIn(normalized) ->
                "POS từ chối tiếp nhận đơn. Kiểm tra nội dung và xử lý thủ công trước khi gửi lại."
            else -> "Chưa chuyển được đơn lên POS. Kiểm tra kết nối; Agent sẽ tự gửi lại."
        }
    }
}
