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
            "timed out" in normalized || "timeout" in normalized ->
                "POS chưa phản hồi kịp. Agent sẽ tự gửi lại."
            "unable to resolve host" in normalized || "connection refused" in normalized ->
                "Không kết nối được POS. Kiểm tra mạng và địa chỉ máy chủ."
            else -> "Chưa chuyển được đơn lên POS. Kiểm tra kết nối; Agent sẽ tự gửi lại."
        }
    }
}
