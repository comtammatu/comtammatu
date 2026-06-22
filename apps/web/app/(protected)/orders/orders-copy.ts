// Page-local copy for the orders route. Co-located because these strings are
// specific to this page's header/tabs; the canonical order entity term comes
// from ORDER_VI in @comtammatu/shared/messages.
export const ORDERS_COPY = {
  eyebrow: "Điều phối giao dịch",
  description:
    "Theo dõi đơn bán và hoàn tiền trong cùng một nơi để xử lý nhanh.",
  reportsAction: "Báo cáo",
  tabOrders: "Danh sách đơn",
  tabRefunds: "Hoàn tiền",
  loadFailed: "Không thể tải đơn hàng",
} as const;
