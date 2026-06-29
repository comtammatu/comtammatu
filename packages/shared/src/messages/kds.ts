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
  stationsLoadFailed:
    "Không tải được danh sách trạm bếp. Vui lòng tải lại trang.",
  queueLoadFailed: "Không tải được món chờ chế biến. Vui lòng tải lại trang.",
  queueDetailLoadFailed:
    "Không tải được chi tiết món chờ chế biến. Vui lòng tải lại trang.",
  ticketCountLoadFailed: "Không tải được số phiếu bếp. Vui lòng tải lại trang.",
} as const;

export type KdsKey = keyof typeof KDS_VI;
