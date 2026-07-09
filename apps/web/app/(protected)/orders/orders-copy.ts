// Page-local copy for the orders route. Co-located because these strings are
// specific to this page's header/tabs; the canonical order entity term comes
// from ORDERS_VI in @comtammatu/shared/messages.
import { ORDERS_VI } from "@comtammatu/shared/messages";

export const ORDERS_COPY = {
  eyebrow: "Điều phối giao dịch",
  description:
    "Theo dõi đơn bán và hoàn tiền trong cùng một nơi để xử lý nhanh.",
  operatorDescription: "Theo dõi đơn mới nhất của chi nhánh trong ca đang chạy.",
  reportsAction: "Báo cáo",
  tabOrders: "Danh sách đơn",
  tabRefunds: "Hoàn tiền",
  loadFailed: ORDERS_VI.loadOrdersFailed,
  noPayment: "—",
  operatorCountNote: (shown: number, total: number) =>
    total > shown
      ? `Hiển thị ${String(shown)} / ${String(total)} đơn mới nhất`
      : `${String(total)} đơn mới nhất`,
  emptyTitle: ORDERS_VI.noOrders,
  emptyDescription: "Chi nhánh chưa có đơn nào trong phạm vi đang xem.",
} as const;
