// Page-local copy for the orders route. Co-located because these strings are
// specific to this page's header/tabs; the canonical order entity term comes
// from ORDERS_VI in @comtammatu/shared/messages.
import { ORDERS_VI } from "@comtammatu/shared/messages";

export const ORDERS_COPY = {
  eyebrow: "Điều phối giao dịch",
  description:
    "Theo dõi đơn bán và hoàn tiền trong cùng một nơi để xử lý nhanh.",
  operatorDescription:
    "Ưu tiên đơn đang xử lý; mở lịch sử gần đây khi cần tra cứu.",
  reportsAction: "Báo cáo",
  tabOrders: "Danh sách đơn",
  tabRefunds: "Hoàn tiền",
  loadFailed: ORDERS_VI.loadOrdersFailed,
  noPayment: "—",
  operatorCountNote: (shown: number, total: number) =>
    total > shown
      ? `Hiển thị ${String(shown)} / ${String(total)} đơn mới nhất`
      : `${String(total)} đơn mới nhất`,
  operatorTabsAriaLabel: "Phạm vi đơn hàng",
  operatorActiveTab: (count: number) => `Đang xử lý (${String(count)})`,
  operatorRecentTab: "Gần đây",
  operatorActiveCountNote: (shown: number, total: number) =>
    total > shown
      ? `Hiển thị ${String(shown)} / ${String(total)} đơn đang xử lý`
      : `${String(total)} đơn đang xử lý`,
  operatorActiveEmptyTitle: "Không có đơn đang xử lý",
  operatorActiveEmptyDescription:
    "Các đơn hoàn thành và đã hủy nằm trong Lịch sử gần đây.",
  emptyTitle: ORDERS_VI.noOrders,
  emptyDescription: "Chi nhánh chưa có đơn nào trong phạm vi đang xem.",
} as const;
