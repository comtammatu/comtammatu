// Orders module Vietnamese copy (extracted from orders JSX).
export const ORDERS_VI = {
  loadHistoryFailed: "Không thể tải lịch sử",
  loadItemsFailed: "Không thể tải món",
  orderedBy: "Người order",
  time: "Thời gian",
  orderType: "Loại đơn",
  payment: "Thanh toán",
  sidesLabel: "Kèm",
  cancelReasonLabel: "Lý do hủy",
  discountLabel: "Giảm giá",
  surchargeLabel: "Phụ phí",
  auditHistoryTitle: "Lịch sử thao tác",
  noAuditHistory: "Chưa có thao tác nào được ghi nhận.",
  loadingItems: "Đang tải món…",
  noItems: "Không có món nào",
} as const;

export type OrdersKey = keyof typeof ORDERS_VI;
