export type SiteKind = "central_warehouse" | "central_kitchen" | "branch";

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
  | "accounting"
  | "reports"
  | "settings"
  | "pos"
  | "kds"
  | "runner"
  | "branch_settings"
  | "branch_menu_limits"
  | "employee"
  | "employee_checkout_approvals"
  | "notifications";

type SiteLike = {
  branch_kind?: string | null;
};

export const MODULE_LABELS_VI: Record<ModuleLabelKey, string> = {
  dashboard: "Tổng quan",
  menu: "Thực đơn",
  inventory: "Kho hàng",
  inventory_procurement: "Kho hàng — NCC & công thức",
  inventory_admin: "Cấu hình kho",
  orders: "Đơn hàng bán",
  staff: "Nhân viên",
  hr: "Nhân sự",
  hr_payroll: "Lương",
  finance: "Tài chính",
  accounting: "Hỗ trợ khóa kỳ",
  reports: "Báo cáo",
  settings: "Cài đặt",
  pos: "POS",
  kds: "KDS",
  runner: "Màn gọi số",
  branch_settings: "Cài đặt chi nhánh",
  branch_menu_limits: "Hạn mức bán hàng ngày",
  employee: "Trang nhân viên",
  employee_checkout_approvals: "Duyệt kết ca",
  notifications: "Thông báo",
};

export const NAV_GROUP_LABELS_VI = {
  operations: "Điều hành",
  foundation: "Quản lý",
  workspaces: "Công việc",
  branchOperations: "Theo chi nhánh",
} as const;

export const APP_COPY_VI = {
  adminSurface: "Quản trị",
  adminFoundation: "Quản lý cửa hàng",
  executiveReporting: "Báo cáo",
  erpCockpit: "Tổng quan vận hành",
  foundationalStaff: "Nhân viên",
  systemSetup: "Thiết lập hệ thống",
  quickAccess: "Mục nhanh",
  quickAccessAria: "Truy cập nhanh chức năng",
  employeePortal: "Trang nhân viên",
  hrWorkspace: "Nhân sự",
  hrWorkspaceSubtitle: "Nhân viên, ca làm, ngày công",
  branchOperationsKds: "Bếp (KDS)",
  branchOperationsRunner: "Màn gọi số",
  loading: "Đang tải…",
  refresh: "Làm mới",
  noAreaData: "Không có dữ liệu khu vực",
  noScopedBranches: "Không có chi nhánh trong phạm vi",
} as const;

export const SITE_KIND_LABELS_VI: Record<SiteKind, string> = {
  central_warehouse: "Kho tổng",
  central_kitchen: "Bếp trung tâm",
  branch: "Chi nhánh",
};

export const INVENTORY_SITE_KIND_LABELS_VI: Record<SiteKind, string> = {
  central_warehouse: "Kho tổng",
  central_kitchen: "Bếp trung tâm",
  branch: "Kho chi nhánh",
};

export const ACTIVE_STATE_LABELS_VI = {
  active: "Hoạt động",
  inactive: "Tạm ngưng",
} as const;

export function resolveSiteKind(site: SiteLike): SiteKind {
  if (site.branch_kind === "central_warehouse") {
    return "central_warehouse";
  }
  if (site.branch_kind === "central_kitchen") {
    return "central_kitchen";
  }
  return "branch";
}

export function getSiteKindLabelVi(siteKind: string): string {
  return SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? siteKind;
}

export function getInventorySiteKindLabelVi(siteKind: string): string {
  return INVENTORY_SITE_KIND_LABELS_VI[siteKind as SiteKind] ?? siteKind;
}

export function getModuleLabelVi(moduleKey: string): string {
  return MODULE_LABELS_VI[moduleKey as ModuleLabelKey] ?? moduleKey;
}

export function getSiteLabelVi(site: SiteLike): string {
  return getSiteKindLabelVi(resolveSiteKind(site));
}

export function getInventorySiteLabelVi(site: SiteLike): string {
  return getInventorySiteKindLabelVi(resolveSiteKind(site));
}

// =============================================================
// Inventory redesign vocabulary (S10-S15 UI wiring)
// =============================================================

/** GRN price variance tier names (Q3 spec) */
export const VARIANCE_TIER_LABELS_VI = {
  0: "Bình thường",
  1: "Gợi ý",
  2: "Xác nhận",
  3: "Ghi chú + override",
  4: "Chặn cứng",
} as const;

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

/** Approval status (waste + GRN hardblock) */
export const APPROVAL_STATUS_LABELS_VI = {
  not_required: "Không cần duyệt",
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
} as const;

/** Stocktake session mode (Q2 spec) */
export const STOCKTAKE_MODE_LABELS_VI = {
  daily: "Kiểm kê ngày",
  weekly: "Kiểm kê tuần (ABC)",
  monthly: "Kiểm kê tháng (blind)",
  quarterly: "Kiểm kê quý (peer cross)",
  spot: "Kiểm tra đột xuất",
} as const;

/** Stocktake session status */
export const STOCKTAKE_STATUS_LABELS_VI = {
  in_progress: "Đang đếm",
  completed: "Đã hòan thành",
  cancelled: "Đã hủy",
} as const;

/** Shift segments (anti-split policy) */
export const SHIFT_SEGMENT_LABELS_VI = {
  morning: "Ca sáng",
  afternoon: "Ca chiều",
  evening: "Ca tối",
} as const;

/** ABC class Pareto tiers */
export const ABC_CLASS_LABELS_VI = {
  A: "Nhóm A (top 80%)",
  B: "Nhóm B (15%)",
  C: "Nhóm C (5%)",
} as const;

/** Offline stocktake conflict resolution options */
export const CONFLICT_RESOLUTION_LABELS_VI = {
  keep_server: "Giữ số trên server",
  apply_client: "Áp số từ thiết bị",
  manual_value: "Nhập số khác",
  reject: "Hủy (không áp dụng)",
} as const;

/** Offline stocktake conflict types */
export const CONFLICT_TYPE_LABELS_VI = {
  is_final_overwrite: "Ghi đè số đã chốt",
  concurrent_round_submit: "2 thiết bị cùng lúc",
  clock_tamper: "Giờ thiết bị sai lệch",
  unknown: "Không xác định",
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

/** Error messages for inventory forms */
export const INVENTORY_ERROR_LABELS_VI = {
  photo_required: "Cần ảnh chứng minh (waste tier ≥ 1)",
  note_too_short: "Ghi chú tối thiểu ký tự",
  rate_limit_exceeded: "Đã vượt giới hạn thử lại — vui lòng đợi",
  shift_cap_exceeded: "Vượt hạn mức waste ca này",
  branch_daily_cap_exceeded: "Vượt cap waste ngày của chi nhánh",
  self_approval_forbidden: "Không thể tự duyệt phiếu của mình",
  period_hard_closed: "Kỳ khóa sổ đã khóa cứng",
  zone_lock_held_by_other: "Vùng đang được người khác đếm",
  baseline_unavailable: "Chưa đủ dữ liệu giá — cần QLV duyệt thủ công",
  hardblock_evidence_required: "Cần upload PDF bằng chứng",
  offline_clock_invalid: "Giờ thiết bị không hợp lệ",
  stocktake_not_final: "Còn dòng chưa chốt — không thể đóng phiên",
} as const;

/** GRN line variance tier label helper */
export function getVarianceTierLabelVi(tier: number | null): string {
  if (tier === null || tier === undefined) return "Chưa đánh giá";
  return (
    (VARIANCE_TIER_LABELS_VI as Record<number, string>)[tier] ?? String(tier)
  );
}

/** Waste reason code label helper */
export function getWasteReasonLabelVi(code: string): string {
  return (WASTE_REASON_LABELS_VI as Record<string, string>)[code] ?? code;
}

/** Stocktake mode label helper */
export function getStocktakeModeLabelVi(mode: string): string {
  return (STOCKTAKE_MODE_LABELS_VI as Record<string, string>)[mode] ?? mode;
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
// `bank_transfer` belongs to GL supplier-payment flow (TT 25/2018 hóa đơn
// ≥ 20tr), NOT POS — kept here for finance/accounting surfaces.
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

export function getPaymentMethodLabelVi(
  method: string | null | undefined,
): string {
  if (!method) return "";
  return (PAYMENT_METHOD_LABELS_VI as Record<string, string>)[method] ?? method;
}

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
