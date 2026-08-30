package com.comtammatu.relay

data class IncomingOrderAlertText(
    val title: String,
    val body: String
)

object IncomingOrderAlertTextBuilder {
    fun build(platformName: String, displayOrderRef: String?, queueId: Long): IncomingOrderAlertText =
        IncomingOrderAlertText(
            title = "Đơn mới · $platformName",
            body = if (displayOrderRef.isNullOrBlank()) {
                "Đã nhận phiếu #$queueId. Chạm để mở sổ đối chiếu."
            } else {
                "Mã $displayOrderRef đã được tiếp nhận. Chạm để mở sổ đối chiếu."
            }
        )
}
