/**
 * Map promotion / discount RPC fragments to Vietnamese copy.
 * Never return the raw Postgres `error.message`.
 */
export function mapPromotionRpcError(message: string): string {
  const msg = String(message ?? "").toLowerCase();

  if (msg.includes("forbidden") || msg.includes("42501")) {
    return "Không có quyền thực hiện thao tác này.";
  }
  if (msg.includes("tenant mismatch") || msg.includes("branch mismatch")) {
    return "Không có quyền truy cập đơn này.";
  }
  if (msg.includes("order not found")) {
    return "Không tìm thấy đơn hàng.";
  }
  if (msg.includes("promotion not found")) {
    return "Không tìm thấy chiến dịch.";
  }
  if (msg.includes("promotion_code_invalid")) {
    return "Mã giảm không hợp lệ hoặc đã hết hạn.";
  }
  if (msg.includes("promotion_code_spent")) {
    return "Mã giảm đã hết lượt dùng.";
  }
  if (msg.includes("promotion_not_eligible")) {
    return "Đơn chưa đủ điều kiện khuyến mãi.";
  }
  if (msg.includes("promotion_already_applied")) {
    return "Đơn đã có khuyến mãi. Vui lòng bỏ khuyến mãi trước.";
  }
  if (msg.includes("promotion_clear_required")) {
    return "Đơn đang có khuyến mãi. Vui lòng bỏ khuyến mãi trước khi chiết khấu tay.";
  }
  if (msg.includes("manual_discount_present")) {
    return "Đơn đang có chiết khấu tay. Vui lòng bỏ chiết khấu trước khi áp mã.";
  }
  if (msg.includes("promotion_not_applied")) {
    return "Đơn chưa có khuyến mãi để bỏ.";
  }
  if (msg.includes("promotion_item_stack_blocked")) {
    return "Chiến dịch này không cho chiết khấu món cùng lúc.";
  }
  if (msg.includes("promotion_issue_count_invalid")) {
    return "Số mã phát hành phải từ 1 đến 200.";
  }
  if (msg.includes("promotion_not_voucher")) {
    return "Chỉ phát hành mã voucher cho chiến dịch mệnh giá.";
  }
  if (msg.includes("promotion_code_not_voidable")) {
    return "Không thể hủy mã đã dùng hoặc đã hủy.";
  }
  if (msg.includes("merge_promotion_blocked")) {
    return "Đơn đang có khuyến mãi — vui lòng bỏ khuyến mãi trước khi gộp.";
  }
  if (msg.includes("split_promotion_blocked")) {
    return "Đơn đang có khuyến mãi — vui lòng bỏ khuyến mãi trước khi tách.";
  }
  if (msg.includes("discount_note_required")) {
    return "Ghi chú tối thiểu 3 ký tự.";
  }
  if (msg.includes("discount_zero_amount")) {
    return "Giá trị giảm bằng 0.";
  }
  if (msg.includes("payment_code_locked")) {
    return "Đơn đã phát hành QR/chuyển khoản, không thể đổi số tiền. Vui lòng hoàn tất thanh toán hoặc xử lý lại đơn.";
  }
  if (msg.includes("order already paid")) {
    return "Đơn đã thanh toán, không thể sửa chiết khấu.";
  }
  if (msg.includes("order terminal")) {
    return "Đơn đã hủy hoặc hoàn tất.";
  }
  if (msg.includes("55p03")) {
    return "Đang có thao tác khác trên đơn này. Vui lòng thử lại.";
  }

  console.error("[promotions] [unmapped] rpc error:", message);
  return "Không thể thực hiện thao tác. Vui lòng thử lại.";
}
