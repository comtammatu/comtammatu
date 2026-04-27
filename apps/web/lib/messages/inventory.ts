export const inventory = {
  grn: {
    created: "Tạo phiếu nhập {code} thành công",
    updated: "Cập nhật phiếu nhập {code} thành công",
    approved: "Đã duyệt phiếu nhập {code}",
    cancelled: "Đã hủy phiếu nhập {code}",
    confirmed: "Đã chốt nhập kho",
    confirmedWithReview:
      "Đã chốt nhập kho. {count} dòng cần kiểm tra giá lệch lớn.",
    saveEmpty: "Không có thay đổi nào để lưu.",
    saveLinesFailed: "{name}: {reason}",
    saveLinesOk: "Đã lưu {ok}/{total} dòng.",
    confirmFailed: "Không thể chốt nhập kho.",
    confirmBlockedByDirty: "Vui lòng lưu thay đổi trước khi chốt.",
    approveConfirmTitle: "Duyệt phiếu nhập?",
    approveConfirmDesc:
      "Sau khi duyệt, phiếu nhập không thể chỉnh sửa và tồn kho sẽ được cập nhật.",
    cancelConfirmTitle: "Hủy phiếu nhập?",
    cancelConfirmDesc: "Phiếu nhập sẽ bị đánh dấu hủy và không thể hòan tác.",
    confirmGrnTitle: "Chốt nhập kho?",
    confirmGrnDesc:
      "Sau khi chốt, phiếu nhập không thể chỉnh sửa và tồn kho sẽ được cập nhật ngay.",
    returnCreated: "Đã tạo phiếu trả hàng NCC (nháp).",
    returnFailed: "Không thể tạo phiếu trả hàng.",
    returnNoRejection: "Phiếu nhập không có dòng nào bị từ chối.",
  },
  po: {
    created: "Tạo đơn đặt hàng {code} thành công",
    updated: "Cập nhật đơn đặt hàng {code} thành công",
    approved: "Đã duyệt đơn đặt hàng {code}",
    cancelled: "Đã hủy đơn đặt hàng {code}",
  },
  transfer: {
    created: "Tạo chuyển kho {code} thành công",
    approved: "Đã duyệt chuyển kho {code}",
    received: "Đã nhận chuyển kho {code}",
  },
  stocktake: {
    created: "Tạo phiếu kiểm kê {code} thành công",
    submitted: "Đã gửi phiếu kiểm kê {code}",
    approved: "Đã duyệt phiếu kiểm kê {code}",
  },
} as const
