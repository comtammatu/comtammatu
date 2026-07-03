export type SiteKind = "branch" | "central_supply" | "central_kitchen";

export type ModuleLabelKey =
  | "dashboard"
  | "menu"
  | "inventory"
  | "inventory_procurement"
  | "inventory_admin"
  | "orders"
  | "staff"
  | "hr"
  | "hr_payroll"
  | "finance"
  | "branches"
  | "branch_picker"
  | "settings"
  | "pos"
  | "kds"
  | "runner"
  | "operator_home"
  | "branch_dashboard"
  | "branch_settings"
  | "branch_menu_limits"
  | "branch_team"
  | "employee"
  | "employee_checkout_approvals"
  | "employee_leave_approvals"
  | "notifications";

type SiteLike = {
  branch_kind?: string | null;
};

export const MODULE_LABELS_VI: Record<ModuleLabelKey, string> = {
  dashboard: "Điều hành hôm nay",
  menu: "Thực đơn",
  inventory: "Kho hàng",
  inventory_procurement: "Kho hàng — NCC & công thức",
  inventory_admin: "Cấu hình kho",
  orders: "Đơn hàng bán",
  staff: "Nhân viên",
  hr: "Nhân sự",
  hr_payroll: "Lương",
  finance: "Tài chính",
  branches: "Chi nhánh",
  branch_picker: "Chọn chi nhánh",
  settings: "Cài đặt",
  pos: "POS",
  kds: "KDS",
  runner: "Màn gọi số",
  operator_home: "Hôm nay",
  branch_dashboard: "Điều hành chi nhánh",
  branch_settings: "Cài đặt chi nhánh",
  branch_menu_limits: "Giới hạn bán",
  branch_team: "Đội hôm nay",
  employee: "Ca của tôi",
  employee_checkout_approvals: "Duyệt kết ca",
  employee_leave_approvals: "Duyệt nghỉ phép",
  notifications: "Thông báo",
};

export const NAV_GROUP_LABELS_VI = {
  operations: "Điều hành",
  foundation: "Quản lý",
  workspaces: "Công việc",
  branchManagement: "Quản lý chi nhánh",
  branchOperations: "Theo chi nhánh",
} as const;

export const APP_COPY_VI = {
  adminSurface: "Quản trị",
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
  operatorHome: "Hôm nay",
  operatorRuntimeActions: "Vận hành chi nhánh",
  operatorOpsActions: "Cấu hình chi nhánh",
  operatorShift: "Ca",
  operatorManagement: "Quản lý",
  operatorAriaLabel: "Điều hướng hôm nay",
  loading: "Đang tải…",
  refresh: "Làm mới",
  noAreaData: "Không có dữ liệu khu vực",
  noScopedBranches: "Không có chi nhánh trong phạm vi",
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
  confirmed: "Xác nhận",
  sent: "Đã gửi",
  credited: "Đã ghi credit",
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
  normal: "Bình thường",
  low: "Thấp",
  out: "Hết hàng",
  over: "Dư tồn",
  active: "Hoạt động",
  suspended: "Tạm ngưng",
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
  return (
    SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? SITE_KIND_LABELS_VI.branch
  );
}

export function getInventorySiteKindLabelVi(siteKind: string): string {
  return INVENTORY_SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? siteKind;
}

export function getModuleLabelVi(moduleKey: string): string {
  return MODULE_LABELS_VI[moduleKey as ModuleLabelKey] ?? moduleKey;
}

export function getInventorySiteLabelVi(site: SiteLike): string {
  return getInventorySiteKindLabelVi(resolveSiteKind(site));
}

// =============================================================
// Inventory redesign vocabulary (S10-S15 UI wiring)
// =============================================================

/** Variance tier short copy (inline hint) */
export const VARIANCE_TIER_HINT_VI = {
  0: "Trong ngưỡng",
  1: "Lệch ±15–30%",
  2: "Lệch ±30–100% — cần ghi chú",
  3: "Lệch ≥100% — cần override QLV",
} as const;

/** Baseline source names for GRN variance */
export const BASELINE_SOURCE_LABELS_VI = {
  same_supplier: "NCC cùng",
  any_supplier: "NCC khác (fallback)",
  none: "Chưa đủ lịch sử",
  paused: "Tạm dừng (sau override)",
} as const;

/** Waste tier names (Q1 spec) */
export const WASTE_TIER_LABELS_VI = {
  0: "Không gate",
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
  weekly: "Kiểm kê tuần (ABC)",
  monthly: "Kiểm kê tháng (blind)",
  quarterly: "Kiểm kê quý (peer cross)",
  spot: "Kiểm tra đột xuất",
} as const;

/** ABC class Pareto tiers */
export const ABC_CLASS_LABELS_VI = {
  A: "Nhóm A (top 80%)",
  B: "Nhóm B (15%)",
  C: "Nhóm C (5%)",
} as const;

/** Hardblock override reason codes (Q3 §B5) */
export const HARDBLOCK_REASON_LABELS_VI = {
  market_spike: "Giá thị trường biến động",
  contract_new: "Hợp đồng mới",
  quality_upgrade: "Nâng cấp chất lượng",
  fx_jump: "Biến động tỷ giá",
  emergency_supply: "Cung ứng khẩn cấp",
  other: "Khác",
} as const;

/** GRN auto-approve 8 conditions (Q4a spec) */
export const AUTO_APPROVE_CONDITION_LABELS_VI = {
  c1_has_po: "Có đơn hàng (PO)",
  c2_variance_ok: "Lệch giá ≤ 30%",
  c3_line_totals_diff: "Tổng & dòng khớp (±3% / 10% qty / 15% price)",
  c4_no_quality_issue: "Không lỗi chất lượng",
  c5_value_cap: "Tổng ≤ 10 triệu",
  c6_supplier_history: "NCC đã có ≥ 3 GRN/90 ngày",
  c7_no_manual_review: "Không thuộc cold-chain",
  c8_trust_score_ok: "Điểm tin cậy ≥ 70",
} as const;

/** Failed reason codes from grn_is_auto_approvable */
export const AUTO_APPROVE_FAIL_REASON_VI = {
  no_po: "Thiếu PO",
  variance_tier_gt1: "Lệch giá vượt ngưỡng",
  line_totals_diff: "Tổng/dòng lệch quá",
  quality_issue: "Có dòng lỗi chất lượng",
  value_cap: "Vượt cap giá trị",
  supplier_history_lt3: "NCC chưa đủ lịch sử",
  ingredient_manual_review: "Có cold-chain SKU",
  trust_score_lt70: "Điểm tin cậy chưa đủ",
} as const;

/** Waste reason code label helper */
export function getWasteReasonLabelVi(code: string): string {
  return (WASTE_REASON_LABELS_VI as Record<string, string>)[code] ?? code;
}

// ─── Payment method labels ────────────────────────────────────────────────
//
// Canonical Vietnamese labels for `orders.payment_method`. Source of truth
// for POS UI + finance reports + admin surfaces.
//
// MIRRORED in apps/print-agent/src/escpos.ts and escpos-bitmap.ts because
// print-agent ships as a standalone .exe (@yao-pkg/pkg) and cannot import
// workspace packages — keep both copies in sync. See glossary.md (Thanh toán).
//
// `bank_transfer` belongs to supplier/payment support, NOT POS.
export const PAYMENT_METHOD_LABELS_VI = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
  bank_transfer: "Chuyển khoản",
} as const;

/** Long form for shift-close / accounting reports where ambiguity must be
 * eliminated (kế toán đọc cần phân biệt rõ kênh tiền). */
export const PAYMENT_METHOD_LABELS_FULL_VI = {
  ...PAYMENT_METHOD_LABELS_VI,
  vietqr: "Chuyển khoản (VietQR)",
  unknown: "Khác",
} as const;

/** orders.status (DB orders_status_check) — full back-office vocabulary.
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
  return (PAYMENT_METHOD_LABELS_VI as Record<string, string>)[method] ?? method;
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

/** summary_run_queue.status (DB summary_run_queue_status_check). */
export const SUMMARY_RUN_STATUS_LABELS_VI = {
  queued: "Đang chờ",
  running: "Đang chạy",
  issued: "Đã phát hành",
  failed: "Thất bại",
  skipped: "Bỏ qua",
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
