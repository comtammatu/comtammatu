/**
 * Template content model + per-kind defaults.
 *
 * MIRRORS public.print_template_default_content() in SQL (supabase baseline
 * + receipt payment template migrations). The database materializes these
 * server-side for every print job; this TS copy powers the agent's offline
 * fallback and the admin editor preview. Keep both sides identical.
 */

import type { PrintDocumentBlock } from "./print-document";

export type PrintKind =
  | "receipt"
  | "provisional_bill"
  | "kitchen_ticket"
  | "cancel_ticket"
  | "shift_close_report";

export const PRINT_KINDS: readonly PrintKind[] = [
  "receipt",
  "provisional_bill",
  "kitchen_ticket",
  "cancel_ticket",
  "shift_close_report",
];

/** Visibility conditions evaluated against the job payload at materialize time. */
export type TemplateCondition = {
  when_field?: string;
  when_equals?: string;
  when_not_equals?: string;
  when_not_equals_field?: string;
  when_not_empty?: boolean;
  when_min?: number;
};

/** Composite blocks expanded into primitives at materialize time. */
export type TemplateCompositeType =
  | "kitchenItems"
  | "cancelItems"
  | "shiftCashReconciliation"
  | "paymentBreakdown"
  | "shiftOrderSummary"
  | "shiftItemBreakdown"
  | "shiftVarianceNotice"
  | "shiftSignature"
  | "varianceApproval"
  | "kitchenTicket"
  | "cancelTicket"
  | "shiftCloseReport";

export type TemplateBlock = (
  | PrintDocumentBlock
  | { type: TemplateCompositeType }
) &
  TemplateCondition & { [key: string]: unknown };

export type TemplateContent = { blocks: TemplateBlock[] };

/** Payload variables usable in text/row blocks as {{name}}. Mirrors
 * print_template_interpolate() — adding one requires both sides. */
export const TEMPLATE_VARIABLES = [
  "order_header",
  "order_number",
  "branch_name",
  "branch_address",
  "branch_phone",
  "cashier_name",
  "printed_at",
  "printed_time",
  "printed_datetime",
  "created_datetime",
  "opened_datetime",
  "closed_datetime",
  "duration",
  "total_amount",
  "order_destination",
  "kitchen_ticket_number",
  "kitchen_ticket_number_raw",
  "source_order_number",
  "table_number",
  "send_seq",
  "slot",
  "reprint_seq",
  "voided_by",
  "reason",
  "session_id",
  "note",
] as const;

const brandHeader: TemplateBlock = {
  type: "brandHeader",
  eyebrow: "TIỆM CƠM TẤM",
  name: "MÁ TƯ",
  tagline: "Thịt tươi 100%",
};

const receiptHeader: TemplateBlock[] = [brandHeader, { type: "branchInfo" }];

export const DEFAULT_TEMPLATE_CONTENT: Record<PrintKind, TemplateContent> = {
  receipt: {
    blocks: [
      ...receiptHeader,
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "HÓA ĐƠN THANH TOÁN",
        align: "center",
        bold: true,
        double: true,
      },
      {
        type: "text",
        text: "{{order_header}}",
        align: "center",
        bold: true,
        double: true,
      },
      { type: "divider", char: "=" },
      { type: "billMeta" },
      { type: "paymentMethod" },
      { type: "itemsTable", group_by_category: true },
      { type: "totals", always_show_adjustments: true },
      { type: "cashChange" },
      { type: "note", prefix: "Ghi chú: " },
      { type: "paymentQr", heading: "QUÉT QR THANH TOÁN" },
      { type: "footer", lines: ["Thịt tươi 100%"] },
    ],
  },
  provisional_bill: {
    blocks: [
      brandHeader,
      { type: "branchInfo" },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "PHIẾU TẠM TÍNH",
        align: "center",
        bold: true,
        double: true,
      },
      {
        type: "text",
        text: "{{order_header}}",
        align: "center",
        bold: true,
        double: true,
      },
      { type: "divider", char: "=" },
      { type: "billMeta" },
      { type: "itemsTable", group_by_category: true },
      { type: "totals", always_show_adjustments: true },
      { type: "note", prefix: "Ghi chú: " },
      { type: "paymentQr", heading: "QUÉT QR THANH TOÁN" },
      { type: "footer", lines: ["Thịt tươi 100%"] },
    ],
  },
  kitchen_ticket: {
    blocks: [
      {
        type: "text",
        text: "{{order_header}}",
        align: "center",
        bold: true,
        double: true,
      },
      {
        type: "text",
        text: "GỌI THÊM",
        align: "center",
        bold: true,
        double: true,
        when_field: "send_kind",
        when_equals: "append",
      },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "IN LẠI LẦN #{{reprint_seq}}",
        align: "center",
        bold: true,
        double: true,
        when_field: "reprint_seq",
        when_min: 2,
      },
      {
        type: "divider",
        char: "=",
        when_field: "reprint_seq",
        when_min: 2,
      },
      {
        type: "row",
        left: "Đơn: {{source_order_number}}",
        right: "Lần gửi: {{send_seq}}",
      },
      {
        type: "row",
        left: "Phiếu bếp: {{kitchen_ticket_number_raw}}",
        right: "Bếp: {{slot}}",
        when_field: "kitchen_ticket_number_raw",
        when_not_empty: true,
      },
      {
        type: "row",
        left: "Bàn: {{table_number}}",
        right: "Giờ: {{printed_time}}",
        when_field: "table_number",
        when_not_empty: true,
      },
      {
        type: "row",
        left: "Giờ: {{printed_time}}",
        right: "",
        when_field: "table_number",
        when_equals: "",
      },
      {
        type: "text",
        text: "Người nhận đơn: {{cashier_name}}",
        when_field: "cashier_name",
        when_not_empty: true,
      },
      { type: "kitchenItems" },
      {
        type: "divider",
        char: "=",
        when_field: "note",
        when_not_empty: true,
      },
      {
        type: "text",
        text: "GHI CHÚ",
        align: "center",
        bold: true,
        double: true,
        when_field: "note",
        when_not_empty: true,
      },
      {
        type: "text",
        text: "{{note}}",
        align: "center",
        bold: true,
        double: true,
        when_field: "note",
        when_not_empty: true,
      },
      {
        type: "divider",
        char: "=",
        when_field: "note",
        when_not_empty: true,
      },
    ],
  },
  cancel_ticket: {
    blocks: [
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "HỦY MÓN",
        align: "center",
        bold: true,
        double: true,
        inverse: true,
      },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "{{order_header}}",
        align: "center",
        bold: true,
        double: true,
      },
      { type: "divider", char: "=" },
      { type: "row", left: "Bếp: {{slot}}", right: "Giờ: {{printed_time}}" },
      {
        type: "row",
        left: "Bàn: {{table_number}}",
        right: "",
        when_field: "table_number",
        when_not_empty: true,
      },
      {
        type: "text",
        text: "Người hủy: {{voided_by}}",
        when_field: "voided_by",
        when_not_empty: true,
      },
      { type: "cancelItems" },
      {
        type: "divider",
        char: "=",
        when_field: "reason",
        when_not_empty: true,
      },
      {
        type: "text",
        text: "LÝ DO",
        align: "center",
        bold: true,
        double: true,
        when_field: "reason",
        when_not_empty: true,
      },
      {
        type: "text",
        text: "{{reason}}",
        align: "center",
        when_field: "reason",
        when_not_empty: true,
      },
      {
        type: "divider",
        char: "=",
        when_field: "reason",
        when_not_empty: true,
      },
    ],
  },
  shift_close_report: {
    blocks: [
      brandHeader,
      { type: "branchInfo" },
      { type: "divider", char: "=" },
      {
        type: "text",
        text: "PHIẾU CHỐT CA",
        align: "center",
        bold: true,
        double: true,
      },
      {
        type: "text",
        text: "BIÊN BẢN BÀN GIAO TIỀN & DOANH THU",
        align: "center",
        bold: true,
      },
      { type: "text", text: "Mã ca: #{{session_id}}", align: "center" },
      { type: "divider", char: "=" },
      {
        type: "row",
        left: "Thu ngân:",
        right: "{{cashier_name}}",
        when_field: "cashier_name",
        when_not_empty: true,
      },
      { type: "row", left: "Mở ca:", right: "{{opened_datetime}}" },
      { type: "row", left: "Đóng ca:", right: "{{closed_datetime}}" },
      {
        type: "row",
        left: "Thời gian:",
        right: "{{duration}}",
        when_field: "duration",
        when_not_empty: true,
      },
      { type: "shiftOrderSummary" },
      { type: "shiftItemBreakdown" },
      { type: "shiftCashReconciliation" },
      { type: "paymentBreakdown" },
      { type: "note", prefix: "Ghi chú bàn giao: " },
      { type: "shiftVarianceNotice" },
      { type: "shiftSignature" },
      { type: "spacer", lines: 1 },
      { type: "text", text: "In lúc: {{printed_datetime}}", align: "center" },
      { type: "footer", lines: ["Thịt tươi 100%"] },
    ],
  },
};
