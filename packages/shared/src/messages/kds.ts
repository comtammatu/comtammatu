// KDS terminal Vietnamese copy (extracted from br/[branchId]/kds JSX).
export const KDS_VI = {
  viewModeAria: "Chế độ hiển thị KDS",
  viewModeFocusAria: "Đang làm — một đơn rõ ràng",
  viewModeFocusTooltip: "Đang làm",
  viewModeOverviewAria: "Tổng quan — hiển thị nhiều đơn",
  viewModeOverviewTooltip: "Tổng quan",
  filterAll: "Tất cả",
  filterOrderTypeAria: "Lọc theo loại đơn",
  filterOrderTypePlaceholder: "Loại đơn",
  statusErrorTitle: "KDS chưa sẵn sàng",
  statusErrorBadge: "Cần tải lại",
  stationsLoadFailed:
    "Không tải được danh sách trạm bếp. Vui lòng tải lại trang.",
  queueLoadFailed: "Không tải được món chờ chế biến. Vui lòng tải lại trang.",
  queueDetailLoadFailed:
    "Không tải được chi tiết món chờ chế biến. Vui lòng tải lại trang.",
  ticketCountLoadFailed: "Không tải được số phiếu bếp. Vui lòng tải lại trang.",
  completionHistoryLoading: "Đang tải lịch sử hoàn thành...",
  completionHistoryEmpty: "Chưa có phiếu bếp nào hoàn thành hôm nay.",
  completionHistoryLoadFailed:
    "Không thể tải lịch sử hoàn thành. Vui lòng thử lại.",
  completionHistoryDetailLoadFailed:
    "Không thể tải chi tiết lịch sử hoàn thành. Vui lòng thử lại.",
  unitOrder: "đơn",
} as const;

export type KdsKey = keyof typeof KDS_VI;
