export type SiteKind = "branch" | "central_supply" | "central_kitchen";

export type InventoryLocationLabelLength = "short" | "long";

export const UNKNOWN_LABEL_VI = "Không xác định";

export type ModuleLabelKey =
  | "owner"
  | "menu"
  | "inventory"
  | "orders"
  | "feedback"
  | "staff"
  | "hr"
  | "hr_payroll"
  | "finance"
  | "branches"
  | "settings"
  | "pos"
  | "kds"
  | "runner"
  | "branch_home"
  | "branch_dashboard"
  | "branch_settings"
  | "branch_menu_limits"
  | "branch_pos_sessions"
  | "branch_close_day"
  | "branch_team"
  | "branch_stock"
  | "branch_orders"
  | "branch_feedback"
  | "employee_checkout_approvals"
  | "employee_leave_approvals"
  | "branch_shift_roster"
  | "branch_shift_attendance"
  | "notifications";

type SiteLike = {
  branch_kind?: string | null;
};

export const MODULE_LABELS_VI: Record<ModuleLabelKey, string> = {
  owner: "Tổng quan",
  menu: "Thực đơn",
  inventory: "Kho hàng",
  orders: "Đơn hàng bán",
  feedback: "Phản hồi",
  staff: "Nhân viên",
  hr: "Nhân sự",
  hr_payroll: "Lương",
  finance: "Tài chính",
  branches: "Chi nhánh",
  settings: "Cài đặt",
  pos: "POS",
  kds: "KDS",
  runner: "Màn gọi số",
  branch_home: "Nay",
  branch_dashboard: "Điều hành chi nhánh",
  branch_settings: "Thiết lập chi nhánh",
  branch_menu_limits: "Giới hạn bán",
  branch_pos_sessions: "Đối soát ca POS",
  branch_close_day: "Chốt ngày",
  branch_team: "Nhân sự chi nhánh",
  branch_stock: "Kho chi nhánh",
  branch_orders: "Đơn hàng chi nhánh",
  branch_feedback: "Phản hồi chi nhánh",
  employee_checkout_approvals: "Duyệt kết ca",
  employee_leave_approvals: "Duyệt nghỉ phép",
  branch_shift_roster: "Phân ca",
  branch_shift_attendance: "Bảng chấm công",
  notifications: "Thông báo",
};

export const NAV_GROUP_LABELS_VI = {
  operations: "Điều hành",
  ownerOperations: "Quản trị",
  foundation: "Nền tảng & thiết lập",
  branchManagement: "Quản lý chi nhánh",
  branchOperations: "Theo chi nhánh",
} as const;

export const APP_COPY_VI = {
  ownerSurface: "Quản trị",
  storeManagement: "Quản lý cửa hàng",
  reportsLabel: "Báo cáo",
  ownerHome: "Điều hành hôm nay",
  staffLabel: "Tài khoản & quyền",
  staffAuditLabel: "Nhật ký quyền hạn",
  settingsLabel: "Thiết lập hệ thống",
  quickAccess: "Mục nhanh",
  quickAccessAria: "Truy cập nhanh chức năng",
  employeePortal: "Ca của tôi",
  hrWorkspace: "Nhân sự",
  hrWorkspaceSubtitle: "Nhân viên, ca làm, ngày công",
  branchOperationsKds: "Bếp (KDS)",
  branchOperationsRunner: "Màn gọi số",
  branchCommand: "Điều hành chi nhánh",
  branchHome: "Hôm nay",
  operatorRuntimeActions: "Vận hành chi nhánh",
  operatorOpsActions: "Thiết lập chi nhánh",
  operatorShift: "Ca",
  operatorManagement: "Quản lý",
  operations: "Điều hành",
  operatorAriaLabel: "Điều hướng hôm nay",
  loading: "Đang tải…",
  refresh: "Làm mới",
  noAreaData: "Không có dữ liệu khu vực",
  noScopedBranches: "Không có nơi làm việc trong phạm vi",
  ownerTitle: "Quản trị",
  ownerDescription:
    "Điều hành, kiểm soát và thiết lập toàn hệ thống dành cho chủ sở hữu",
  ownerCta: "Mở Quản trị",
} as const;

const SITE_KIND_LABELS_VI: Record<SiteKind, string> = {
  branch: "Chi nhánh",
  central_supply: "Kho Tổng",
  central_kitchen: "Bếp Trung Tâm",
};

const INVENTORY_SITE_KIND_LABELS_VI: Record<SiteKind, string> = {
  branch: "Kho chi nhánh",
  central_supply: "Kho Tổng",
  central_kitchen: "Bếp Trung Tâm",
};

const LEGACY_INVENTORY_LOCATION_NAMES_VI: Record<string, string> = {
  "Kho CN": "Kho chi nhánh",
};

export const ACTIVE_STATE_LABELS_VI = {
  active: "Hoạt động",
  inactive: "Tạm ngưng",
} as const;

export const ATTENDANCE_STATUS_LABELS_VI = {
  present: "Có mặt",
  late: "Đi trễ",
  absent: "Vắng",
  half_day: "Nửa ngày",
  checked_out: "Đã kết ca",
  in_shift: "Đang trong ca",
  stale_open: "Treo (chưa kết ca)",
} as const;

export const LEAVE_REQUEST_STATUS_LABELS_VI = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
} as const;

export const LEAVE_TYPE_LABELS_VI = {
  annual: "Nghỉ phép",
  sick: "Nghỉ bệnh",
  unpaid: "Nghỉ không lương",
  personal: "Việc cá nhân",
  other: "Khác",
} as const;

export const PAYROLL_PERIOD_STATUS_LABELS_VI = {
  draft: "Nháp",
  calculated: "Đã tính",
  approved: "Đã duyệt",
  paid: "Đã trả",
} as const;

/** Contract compensation pay basis — never show raw enum keys in Owner UI. */
export const PAY_BASIS_LABELS_VI = {
  attendance_prorated: "Theo công",
  fixed_monthly: "Lương tháng",
} as const;

export type PayBasisCode = keyof typeof PAY_BASIS_LABELS_VI;

export function getPayBasisLabelVi(
  payBasis: string | null | undefined,
): string {
  if (payBasis === "attendance_prorated" || payBasis === "fixed_monthly") {
    return PAY_BASIS_LABELS_VI[payBasis];
  }
  return UNKNOWN_LABEL_VI;
}

export const CONSUMPTION_REPORT_STATUS_LABELS_VI = {
  draft: "Nháp",
  submitted: "Chờ duyệt",
  needs_changes: "Cần chỉnh sửa",
  approved: "Đã duyệt - không phát sinh",
  applied: "Đã áp Inventory",
  cancelled: "Đã hủy",
} as const;

export const INVENTORY_STATUS_LABELS_VI = {
  draft: "Nháp",
  pending_allocation: "Chờ phân bổ",
  changes_requested: "Cần chỉnh sửa",
  partially_ordered: "Cần phân bổ lại",
  ordered: "Đã tạo đủ đơn",
  confirmed: "Đã xác nhận",
  sent: "Đã gửi",
  credited: "Đã ghi có",
  refunded: "Đã hoàn tiền",
  partially_received: "Nhận một phần",
  in_transit: "Đang giao",
  received: "Đã nhận",
  completed: "Xong",
  cancelled: "Đã hủy",
  pending: "Chờ xử lý",
  in_progress: "Đang làm",
  matched: "Đã khớp",
  discrepancy: "Lệch",
  approved: "Đã duyệt",
  overdue: "Quá hạn",
  unpaid: "Chưa trả",
  partial: "Trả một phần",
  paid: "Đã thanh toán",
  expired: "Hết hạn",
  critical: "Sắp hết hạn",
  warning: "Theo dõi",
  write_off: "Ghi giảm",
  consumption: "Tiêu hao",
  storage_loss: "Hao hụt kho",
  sale_consumption: "Tiêu hao bán",
  normal: "Đủ hàng",
  low: "Chạm ngưỡng",
  out: "Hết hàng",
  over: "Dư tồn",
  active: "Hoạt động",
  suspended: "Tạm ngưng",
} as const;

export const PURCHASE_ORDER_STATUS_LABELS_VI = {
  draft: "Nháp",
  sent: "Đã duyệt",
  pending_approval: "Chờ duyệt",
  changes_requested: "Cần chỉnh sửa",
  approved: "Đã đặt mua",
  partially_received: "Nhận một phần",
  received: "Đã nhận đủ",
  closed: "Đã đóng",
  cancelled: "Đã hủy",
} as const;

export function resolveSiteKind(site: SiteLike): SiteKind {
  if (
    site.branch_kind === "central_supply" ||
    site.branch_kind === "central_kitchen"
  ) {
    return site.branch_kind;
  }
  return "branch";
}

export function getSiteKindLabelVi(siteKind: string): string {
  return SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? UNKNOWN_LABEL_VI;
}

export function getInventorySiteKindLabelVi(siteKind: string): string {
  return (
    INVENTORY_SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? UNKNOWN_LABEL_VI
  );
}

export function getModuleLabelVi(moduleKey: string): string {
  return MODULE_LABELS_VI[moduleKey as ModuleLabelKey] ?? UNKNOWN_LABEL_VI;
}

export function getInventorySiteLabelVi(site: SiteLike): string {
  return getInventorySiteKindLabelVi(resolveSiteKind(site));
}

export function normalizeInventoryLocationNameVi(
  name: string | null | undefined,
): string {
  if (!name) return "";
  const normalized = LEGACY_INVENTORY_LOCATION_NAMES_VI[name];
  return normalized === undefined ? name : normalized;
}

export function getInventoryLocationKindLabelVi({
  siteKind,
  locationKind,
  fallbackName,
  length = "long",
}: {
  siteKind?: string | null;
  locationKind?: string | null;
  fallbackName?: string | null;
  length?: InventoryLocationLabelLength;
}): string {
  if (siteKind === "branch") {
    if (locationKind === "warehouse") {
      return length === "short" ? "Kho" : "Kho chi nhánh";
    }
  }

  if (siteKind === "central_supply" && locationKind === "warehouse") {
    return "Kho Tổng";
  }

  if (siteKind === "central_kitchen") {
    if (locationKind === "production_storage") return "Kho sản xuất";
    if (locationKind === "warehouse") {
      return "Bếp Trung Tâm";
    }
  }

  return normalizeInventoryLocationNameVi(fallbackName);
}

export function formatInventoryLocationLabelVi({
  branchName,
  siteKind,
  locationKind,
  fallbackName,
  length,
}: {
  branchName?: string | null;
  siteKind?: string | null;
  locationKind?: string | null;
  fallbackName?: string | null;
  length?: InventoryLocationLabelLength;
}): string {
  const locationLabel = getInventoryLocationKindLabelVi({
    siteKind,
    locationKind,
    fallbackName,
    length: length ?? (branchName ? "short" : "long"),
  });
  const siteLabel = normalizeInventoryLocationNameVi(branchName);
  if (!siteLabel || siteLabel === locationLabel) return locationLabel;
  return `${siteLabel} · ${locationLabel}`;
}

/** Waste tier names (Q1 spec) */
export const WASTE_TIER_LABELS_VI = {
  0: "Không chặn",
  1: "Cần ảnh",
  2: "Cần ảnh + duyệt QLV",
} as const;

/** Waste reason codes (Vietnamese) */
export const WASTE_REASON_LABELS_VI = {
  spoiled: "Hư hỏng",
  expired: "Hết hạn",
  dropped: "Rơi vỡ",
  overcook: "Nấu quá",
  burned: "Cháy",
  contaminated: "Nhiễm bẩn",
  quality_fail: "Không đạt chất lượng",
  found_missing: "Phát hiện thiếu",
  theft_suspected: "Nghi ngờ mất cắp",
  customer_return: "Khách trả",
  kds_cancel_mid_cook: "KDS hủy giữa nấu",
  kds_cancel_after_cook: "KDS hủy sau nấu",
  other: "Khác",
} as const;

/** Stocktake session mode (Q2 spec) */
export const STOCKTAKE_MODE_LABELS_VI = {
  daily: "Kiểm kê ngày",
  weekly: "Kiểm kê tuần theo nhóm",
  monthly: "Kiểm kê tháng · đếm mù",
  quarterly: "Kiểm kê quý · đếm chéo",
  spot: "Kiểm tra đột xuất",
} as const;

/** ABC class Pareto tiers */
export const ABC_CLASS_LABELS_VI = {
  A: "Nhóm A · 80% giá trị",
  B: "Nhóm B · 15% giá trị",
  C: "Nhóm C · 5% giá trị",
} as const;

/** Waste reason code label helper */
export function getWasteReasonLabelVi(code: string): string {
  return (
    (WASTE_REASON_LABELS_VI as Record<string, string>)[code] ?? UNKNOWN_LABEL_VI
  );
}

// ─── Payment method labels ────────────────────────────────────────────────
//
// Canonical Vietnamese labels for `orders.payment_method`. Source of truth
// for POS UI + finance reports + Owner surfaces.
//
// MIRRORED in apps/print-agent/src/escpos.ts and escpos-bitmap.ts because
// print-agent ships as a standalone .exe (@yao-pkg/pkg) and cannot import
// workspace packages — keep both copies in sync. See glossary.md (Thanh toán).
//
// `bank_transfer` belongs to supplier/payment support, NOT POS.
export const PAYMENT_METHOD_LABELS_VI = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  bank_transfer: "Chuyển khoản",
} as const;

/** Long form for shift-close / accounting reports where ambiguity must be
 * eliminated (kế toán đọc cần phân biệt rõ kênh tiền). */
export const PAYMENT_METHOD_LABELS_FULL_VI = {
  ...PAYMENT_METHOD_LABELS_VI,
  vietqr: "Chuyển khoản (VietQR)",
  unknown: "Khác",
} as const;

/** orders.status (DB orders_status_check) — full Owner vocabulary.
 * POS cashier view intentionally collapses these states
 * (apps/web pos/_lib/order-status-display.ts). */
export const ORDER_STATUS_LABELS_VI = {
  new: "Mới tạo",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
} as const;

/** orders.payment_status (DB orders_payment_status_check). */
export const ORDER_PAYMENT_STATUS_LABELS_VI = {
  unpaid: "Chưa thanh toán",
  pending: "Chờ thanh toán",
  paid: "Đã thanh toán",
} as const;

/** payments.status (DB payments_status_check) — per payment record. */
export const PAYMENT_RECORD_STATUS_LABELS_VI = {
  pending: "Chờ thanh toán",
  completed: "Đã thanh toán",
  failed: "Thất bại",
  refunded: "Hoàn tiền",
} as const;

/** Derived payment reconciliation state for operating expenses. */
export const EXPENSE_PAYMENT_STATE_LABELS_VI = {
  unpaid: "Chưa trả",
  cash_paid: "Đã trả TM",
  transfer_paid: "Đã chuyển khoản",
  transfer_matched: "Đã khớp NH",
  transfer_needs_match: "Cần khớp NH",
} as const;

/** refunds.status (DB refunds_status_check). */
export const REFUND_STATUS_LABELS_VI = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
} as const;

export function getPaymentMethodLabelVi(
  method: string | null | undefined,
): string {
  if (!method) return "";
  return (
    (PAYMENT_METHOD_LABELS_VI as Record<string, string>)[method] ??
    UNKNOWN_LABEL_VI
  );
}

/** tables.status (DB tables_status_check). */
export const TABLE_STATUS_LABELS_VI = {
  available: "Trống",
  occupied: "Đang dùng",
  reserved: "Đã đặt",
  maintenance: "Bảo trì",
} as const;

/** print_jobs.status (DB print_jobs_status_check). */
export const PRINT_JOB_STATUS_LABELS_VI = {
  pending: "Chờ",
  processing: "Đang in",
  printed: "Đã in",
  failed: "Lỗi",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
} as const;

/** kds_tickets.status (DB kds_tickets_status_check). */
export const KDS_TICKET_STATUS_LABELS_VI = {
  pending: "Chờ",
  preparing: "Đang chuẩn bị",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  cancelled: "Đã hủy",
} as const;

/** order_items.status (DB order_items_status_check). */
export const ORDER_ITEM_STATUS_LABELS_VI = {
  pending: "Chờ",
  preparing: "Đang chuẩn bị",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  cancelled: "Đã hủy",
} as const;

/** orders.order_type. Receipt invariant duplicates these strings in
 * legal-fixed.ts — keep identical. */
export const ORDER_TYPE_LABELS_VI = {
  dine_in: "Tại bàn",
  takeaway: "Mang về",
} as const;

export function getOrderTypeLabelVi(
  orderType: string | null | undefined,
): string {
  if (!orderType) return "";
  return (
    (ORDER_TYPE_LABELS_VI as Record<string, string>)[orderType] ??
    UNKNOWN_LABEL_VI
  );
}

/** tax_invoices.status (DB tax_invoices_status_check). */
export const TAX_INVOICE_STATUS_LABELS_VI = {
  draft: "Nháp",
  signing: "Đang ký",
  submitted: "Chờ CQT",
  issued: "Đã phát hành",
  cancelled: "Đã hủy",
  replaced: "Đã thay thế",
  not_required: "Không bắt buộc",
} as const;

/** stocktake_sessions.status (DB stocktake_sessions_status_check). */
export const STOCKTAKE_SESSION_STATUS_LABELS_VI = {
  in_progress: "Đang thực hiện",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
} as const;

/** inventory_count_slips.status (DB inventory_count_slips_status_check). */
export const COUNT_SLIP_STATUS_LABELS_VI = {
  submitted: "Chờ duyệt",
  needs_changes: "Cần đếm lại",
  approved: "Đã duyệt",
} as const;
