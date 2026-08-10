/**
 * Shared Vietnamese labels for `audit_logs.action` and related entity types.
 * Product UI must never show raw action codes as the primary title.
 */

export const AUDIT_ACTION_LABELS_VI = {
  create: "Tạo mới",
  update: "Cập nhật",
  delete: "Xoá",
  confirm: "Xác nhận",
  cancel: "Huỷ",
  approve: "Duyệt",
  reject: "Từ chối",
  complete: "Hoàn thành",
  void: "Vô hiệu",

  "inventory.grn.created_from_po": "Tạo phiếu nhập từ đơn đặt hàng",
  "inventory.grn.saved": "Lưu phiếu nhập",
  "inventory.grn.confirmed": "Xác nhận phiếu nhập",
  "inventory.grn.cancelled": "Huỷ phiếu nhập",
  "inventory.grn.line_amended": "Sửa dòng phiếu nhập",
  "inventory.grn.recreated_receiving_site": "Tạo lại phiếu nhập tại điểm nhận",
  "inventory.grn.recreated_from_source": "Tạo lại phiếu nhập từ nguồn",
  "inventory.grn.recovered_from_approved_po":
    "Khôi phục phiếu nhập từ đơn đã duyệt",
  "inventory.grn.weekly_override_report": "Báo cáo ghi đè phiếu nhập trong tuần",

  "inventory.request.created_draft": "Tạo yêu cầu hàng (nháp)",
  "inventory.request.created_submitted": "Tạo và gửi yêu cầu hàng",
  "inventory.request.saved_draft": "Lưu yêu cầu hàng (nháp)",
  "inventory.request.saved_submitted": "Lưu và gửi yêu cầu hàng",
  "inventory.request.cancelled": "Huỷ yêu cầu hàng",
  "inventory.request.closed": "Đóng yêu cầu hàng",
  "inventory.request.lines_rejected": "Từ chối dòng yêu cầu hàng",

  "inventory.transfer.cancelled": "Huỷ phiếu điều chuyển",
  "inventory.transfer.shipped": "Xuất hàng điều chuyển",
  "inventory.transfer.received": "Nhận hàng điều chuyển",

  "inventory.issue.confirmed": "Xác nhận phiếu xuất",
  "inventory.stocktake.created": "Tạo phiên kiểm kê",
  "inventory.stocktake.completed": "Hoàn thành kiểm kê",

  sepay_canonical_reconciliation_match: "Đã khớp giao dịch VietQR",
  sepay_canonical_reconciliation_backfill:
    "Đã bổ sung liên kết giao dịch VietQR",
  sepay_canonical_reconciliation_needs_review:
    "Cần kiểm tra giao dịch VietQR",
} as const satisfies Record<string, string>;

export type AuditActionLabelKey = keyof typeof AUDIT_ACTION_LABELS_VI;

export const AUDIT_ENTITY_TYPE_LABELS_VI = {
  goods_received_note: "Phiếu nhập",
  stock_transfer: "Phiếu điều chuyển",
  stock_request: "Yêu cầu hàng",
  stock_issue: "Phiếu xuất",
  stocktake_session: "Phiên kiểm kê",
  purchase_order: "Đơn đặt hàng",
  orders: "Đơn bán",
  order: "Đơn bán",
  refund: "Hoàn tiền",
  expense: "Khoản chi",
  tax_invoice: "Hóa đơn điện tử",
  employee: "Nhân viên",
  attendance_record: "Chấm công",
  webhook_event: "Sự kiện đối soát",
  permission: "Phân quyền",
} as const satisfies Record<string, string>;

export type AuditEntityTypeLabelKey = keyof typeof AUDIT_ENTITY_TYPE_LABELS_VI;

const PREFIX_FALLBACKS: ReadonlyArray<{ prefix: string; label: string }> = [
  { prefix: "inventory.grn.", label: "Cập nhật phiếu nhập" },
  { prefix: "inventory.request.", label: "Cập nhật yêu cầu hàng" },
  { prefix: "inventory.transfer.", label: "Cập nhật phiếu điều chuyển" },
  { prefix: "inventory.issue.", label: "Cập nhật phiếu xuất" },
  { prefix: "inventory.stocktake.", label: "Cập nhật phiên kiểm kê" },
  { prefix: "procurement.po.", label: "Cập nhật đơn đặt hàng" },
  { prefix: "procurement.demand.", label: "Cập nhật nhu cầu mua hàng" },
  { prefix: "sepay_", label: "Cập nhật đối soát thanh toán" },
];

/** Human Vietnamese title for an audit action code. Never returns the raw code. */
export function formatAuditActionLabel(action: string): string {
  const trimmed = action.trim();
  if (!trimmed) return "Cập nhật dữ liệu";

  // Pre-composed human strings (e.g. HR permission history).
  if (trimmed.includes(" · ")) return trimmed;

  const exact = AUDIT_ACTION_LABELS_VI[trimmed as AuditActionLabelKey];
  if (exact) return exact;

  for (const { prefix, label } of PREFIX_FALLBACKS) {
    if (trimmed.startsWith(prefix)) return label;
  }

  return "Cập nhật dữ liệu";
}

export function formatAuditEntityTypeLabel(entityType: string): string {
  const exact =
    AUDIT_ENTITY_TYPE_LABELS_VI[entityType as AuditEntityTypeLabelKey];
  if (exact) return exact;
  return "Chứng từ";
}

/**
 * Action codes that inventory writers are expected to emit. Used by static
 * tests so the dictionary stays aligned with SQL `log_audit` calls.
 */
export const INVENTORY_AUDIT_ACTION_CODES = [
  "inventory.grn.cancelled",
  "inventory.grn.confirmed",
  "inventory.grn.created_from_po",
  "inventory.grn.line_amended",
  "inventory.grn.recovered_from_approved_po",
  "inventory.grn.recreated_from_source",
  "inventory.grn.recreated_receiving_site",
  "inventory.grn.saved",
  "inventory.grn.weekly_override_report",
  "inventory.request.cancelled",
  "inventory.request.closed",
  "inventory.request.created_draft",
  "inventory.request.created_submitted",
  "inventory.request.lines_rejected",
  "inventory.request.saved_draft",
  "inventory.request.saved_submitted",
  "inventory.transfer.cancelled",
  "inventory.transfer.shipped",
  "inventory.transfer.received",
  "inventory.issue.confirmed",
  "inventory.stocktake.created",
  "inventory.stocktake.completed",
] as const;
