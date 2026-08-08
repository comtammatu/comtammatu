// Page-local copy for the orders route. Co-located because these strings are
// specific to this page's header/tabs; the canonical order entity term comes
// from ORDERS_VI in @comtammatu/shared/messages.
import { ORDERS_VI } from "@comtammatu/shared/messages";

export const ORDERS_COPY = {
  eyebrow: "Điều phối giao dịch",
  description: "Theo dõi đơn bán và hoàn tiền trong cùng một nơi.",
  operatorDescription: "Ưu tiên đơn đang xử lý; tra cứu ở tab Gần đây.",
  reportsAction: "Báo cáo",
  tabOrders: "Danh sách đơn",
  tabRefunds: "Hoàn tiền",
  refundCreateAction: "Ghi nhận đã hoàn tiền",
  refundCreateTitle: "Ghi nhận tiền đã trả cho khách",
  refundCreateDescription:
    "Chỉ xác nhận sau khi tiền đã thực sự trả. Hệ thống đảo thanh toán và phục hồi kho; HĐĐT đã phát hành cần hủy hoặc thay thế riêng khi áp dụng.",
  refundBranchLabel: "Chi nhánh",
  refundBranchPlaceholder: "Chọn chi nhánh",
  refundOrderLabel: "Mã đơn",
  refundOrderPlaceholder: "Nhập đúng mã đơn",
  refundCheckAction: "Kiểm tra đơn",
  refundPayoutLabel: "Hoàn bằng",
  refundPayoutPlaceholder: "Chọn nơi tiền được trả",
  refundReasonLabel: "Lý do hoàn tiền",
  refundReasonPlaceholder:
    "Ví dụ: Đã trả lại tiền vì thu nhầm thanh toán của khách.",
  refundConfirm: "Xác nhận đã hoàn",
  refundSuccess: "Đã ghi nhận hoàn tiền và đảo thanh toán",
  refundFailed: "Không thể ghi nhận hoàn tiền",
  refundEligible: "Đủ điều kiện hoàn toàn bộ thanh toán",
  loadFailed: ORDERS_VI.loadOrdersFailed,
  noPayment: "—",
  operatorCountNote: (shown: number, total: number) =>
    total > shown
      ? `Hiển thị ${String(shown)} / ${String(total)} đơn mới nhất`
      : `${String(total)} đơn mới nhất`,
  operatorTabsAriaLabel: "Phạm vi đơn hàng",
  operatorActiveTab: (count: number) => `Đang xử lý (${String(count)})`,
  operatorRecentTab: "Gần đây",
  operatorActiveAria: (count: number) => `Đang xử lý, ${String(count)} đơn`,
  operatorRecentAria: "Gần đây",
  operatorActiveCountNote: (shown: number, total: number) =>
    total > shown
      ? `Hiển thị ${String(shown)} / ${String(total)} đơn đang xử lý`
      : `${String(total)} đơn đang xử lý`,
  operatorActiveEmptyTitle: "Không có đơn đang xử lý",
  operatorActiveEmptyDescription:
    "Các đơn hoàn thành và đã hủy nằm trong Lịch sử gần đây.",
  emptyTitle: ORDERS_VI.noOrders,
  emptyDescription: "Chi nhánh chưa có đơn nào trong phạm vi đang xem.",
  waitTimeHeader: "Thời gian chờ",
  alertFilterLabel: "Cảnh báo trễ",
  alertFilterAll: "Tất cả",
  alertFilterWarning: "Cảnh báo (10-15 ph)",
  alertFilterCritical: "Báo đỏ (>15 ph)",
  warningCountLabel: "Cảnh báo (10-15 ph)",
  criticalCountLabel: "Báo đỏ (>15 ph)",
  warningCountHint: "Đơn chờ 10–15 phút",
  criticalCountHint: "Cần điều tra ngay",
  waitingSuffix: " (Đang chờ)",
  badgeCritical: (waitMinutes: number, suffix: string) =>
    `Báo đỏ: ${String(waitMinutes)} phút - Cần điều tra${suffix}`,
  badgeWarning: (waitMinutes: number, suffix: string) =>
    `Cảnh báo: ${String(waitMinutes)} phút${suffix}`,
  badgeNormal: (waitMinutes: number, suffix: string) =>
    `${String(waitMinutes)} phút${suffix}`,
  warningToast: (orderNumber: string, waitMinutes: number) =>
    `Cảnh báo: Đơn #${orderNumber} đã chờ ${String(waitMinutes)} phút`,
  kdsAlertCalloutWarningLabel: "Cảnh báo thời gian chờ",
  kdsAlertCalloutCriticalLabel: "Báo đỏ - Cần điều tra (KDS)",
  kdsAlertCalloutWarning:
    "Cảnh báo: Đơn hàng đã chờ 10–15 phút kể từ lúc lên đơn.",
  kdsAlertCalloutCritical:
    "Báo đỏ: Đơn hàng đã chờ quá 15 phút! Quản lý cần kiểm tra ngay với Bếp (KDS).",
  kdsAlertWaitMinutes: (waitMinutes: number) =>
    ` (Thời gian chờ: ${String(waitMinutes)} phút)`,
} as const;
