export const pos = {
  order: {
    created: "Tạo đơn {code} thành công",
    updated: "Cập nhật đơn {code} thành công",
    paid: "Đơn {code} đã thanh toán",
    voided: "Đã huỷ đơn",
    refunded: "Đã hoàn đơn {code}",
    loadFailed: "Không thể tải đơn",
    cancelFailed: "Không thể hủy đơn",
    voidConfirmTitle: "Huỷ đơn?",
    voidConfirmDesc:
      "Thao tác huỷ đơn không thể hoàn tác. Vui lòng kiểm tra lại.",
    transferred: "Đã chuyển bàn",
    transferFailed: "Không thể chuyển bàn",
    markedServed: "Đã đánh dấu phục vụ",
    completed: "Đã hoàn thành",
    statusUpdateFailed: "Không thể cập nhật",
    reorderLoadFailed: "Không thể tải món",
  },
  item: {
    added: "Đã thêm món",
    removed: "Đã xoá món",
    voided: "Đã hủy món",
    voidedAutoCancelOrder: "Đã hủy món — đơn đã được hủy vì không còn món.",
    voidFailed: "Không thể hủy món",
  },
} as const
