// Orders module Vietnamese copy (extracted from orders JSX).
export const ORDERS_VI = {
  loadOrdersFailed: "Không thể tải đơn hàng",
  loadRefundsFailed: "Không thể tải danh sách hoàn tiền",
  loadHistoryFailed: "Không thể tải lịch sử",
  loadItemsFailed: "Không thể tải món",
  loadOperationalEvidenceFailed: "Không thể tải bằng chứng vận hành",
  invalidOperationalEvidence: "Dữ liệu bằng chứng vận hành không hợp lệ",
  noOrders: "Chưa có đơn hàng",
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
  loadingOperationalEvidence: "Đang tải bằng chứng vận hành…",
  noItems: "Không có món nào",
} as const;

export type OrdersKey = keyof typeof ORDERS_VI;
