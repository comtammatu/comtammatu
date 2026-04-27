export const pos = {
  order: {
    created: "Tạo đơn {code} thành công",
    updated: "Cập nhật đơn {code} thành công",
    paid: "Đơn {code} đã thanh toán",
    voided: "Đã hủy đơn",
    refunded: "Đã hòan đơn {code}",
    loadFailed: "Không thể tải đơn",
    cancelFailed: "Không thể hủy đơn",
    voidConfirmTitle: "Hủy đơn?",
    voidConfirmDesc:
      "Thao tác hủy đơn không thể hòan tác. Vui lòng kiểm tra lại.",
    transferred: "Đã chuyển bàn",
    transferFailed: "Không thể chuyển bàn",
    markedServed: "Đã đánh dấu phục vụ",
    completed: "Đã hòan thành",
    statusUpdateFailed: "Không thể cập nhật",
    reorderLoadFailed: "Không thể tải món",
  },
  item: {
    added: "Đã thêm món",
    removed: "Đã xóa món",
    voided: "Đã hủy món",
    voidedAutoCancelOrder: "Đã hủy món — đơn đã được hủy vì không còn món.",
    voidFailed: "Không thể hủy món",
  },
} as const
