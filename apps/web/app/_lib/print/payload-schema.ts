import { z } from "zod";

// ─── Shared pieces ───────────────────────────────────────────────────────

const itemModifierSchema = z.object({
  modifier_id: z.number().int().optional(),
  name: z.string().optional(),
  price: z.number().optional(),
});

const itemSideSchema = z.object({
  side_item_id: z.number().int().optional(),
  side_item_name: z.string().optional(),
  name: z.string().optional(),
  quantity: z.number().int().optional(),
});

const kitchenItemSchema = z.object({
  item_name: z.string(),
  variant_name: z.string().nullable().optional(),
  quantity: z.number().int(),
  modifiers: z.array(itemModifierSchema).nullable().optional(),
  sides: z.array(itemSideSchema).nullable().optional(),
  note: z.string().nullable().optional(),
});

const billItemSchema = kitchenItemSchema.extend({
  unit_price: z.number(),
  subtotal: z.number(),
});

/** Pre-built QR block for provisional bill — backend assembles the EMVCo/MoMo
 * content in TS (via packages/shared/src/providers/impl/vietqr.ts) and passes
 * it to `enqueue_provisional_bill` RPC. Agent just rasterizes + prints. */
const paymentQrSchema = z.object({
  type: z.enum(["vietqr", "momo"]),
  content: z.string().min(1),
  header_label: z.string(),
  account_no: z.string().nullable().optional(),
  account_name: z.string().nullable().optional(),
  amount: z.number(),
  description: z.string(),
});

const billBaseFields = {
  branch_name: z.string().optional(),
  branch_address: z.string().optional(),
  branch_phone: z.string().optional(),
  branch_tax_code: z.string().nullable().optional(),
  order_number: z.string(),
  order_type: z.enum(["dine_in", "takeaway"]),
  table_number: z.number().int().nullable().optional(),
  customer_count: z.number().int().nullable().optional(),
  cashier_name: z.string().optional(),
  note: z.string().nullable().optional(),
  items: z.array(billItemSchema).min(1),
  subtotal: z.number(),
  tax_amount: z.number().nullable().optional(),
  service_charge: z.number().nullable().optional(),
  discount_amount: z.number().nullable().optional(),
  total_amount: z.number(),
  created_at: z.string().optional(),
  printed_at: z.string(),
};

// ─── Kitchen ticket ──────────────────────────────────────────────────────

export const kitchenTicketPayloadSchema = z.object({
  kind: z.literal("kitchen_ticket"),
  kitchen_ticket_number: z.string().optional(),
  source_order_number: z.string().optional(),
  order_number: z.string(),
  order_type: z.enum(["dine_in", "takeaway"]),
  table_number: z.number().int().nullable().optional(),
  /** Tên người tạo đơn (= profiles.full_name của orders.created_by). Bếp
   * dùng để biết hỏi nhân viên nào khi cần xác nhận. */
  cashier_name: z.string().optional(),
  send_seq: z.number().int(),
  send_kind: z.enum(["initial", "append", "manual"]).optional(),
  slot: z.number().int().min(1).max(2),
  /** ≥2 triggers "IN LẠI LẦN #N" banner in the renderer. */
  reprint_seq: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  items: z.array(kitchenItemSchema).min(1),
  printed_at: z.string(),
});

// ─── Provisional bill (PHIẾU TẠM TÍNH) ───────────────────────────────────

export const provisionalBillPayloadSchema = z.object({
  kind: z.literal("provisional_bill"),
  ...billBaseFields,
  /** Nullable: tenants without VietQR/MoMo config print bill w/o QR block. */
  payment_qr: paymentQrSchema.nullable().optional(),
});

// ─── Final receipt (HÓA ĐƠN THANH TOÁN) ──────────────────────────────────

export const receiptPayloadSchema = z.object({
  kind: z.literal("receipt"),
  ...billBaseFields,
  /** Narrowed to methods accepted by the POS. Unknown values fall through
   * to the raw key in the renderer. */
  payment_method: z
    .union([
      z.enum(["cash", "vietqr", "bank_transfer", "momo"]),
      z.string(),
      z.null(),
    ])
    .optional(),
  /** Tiền mặt khách đưa. Null / omitted for non-cash payments. */
  cash_received: z.number().nullable().optional(),
  /** Tiền trả khách = cash_received - total_amount. Null / 0 for non-cash. */
  cash_change: z.number().nullable().optional(),
});

// ─── Cancel ticket (PHIẾU HỦY MÓN) ───────────────────────────────────────

/** Single cancelled item — shape matches the kitchen ticket item so chefs can
 * visually map to the original order. Prices intentionally omitted (kitchen
 * never sees money). `note` (B6): per-item ghi chú từ POS — bếp dùng để
 * disambiguate khi có nhiều món cùng tên (vd "ít muối" vs "không hành").
 * Optional vì jobs cũ trong queue chưa có field này. */
const cancelItemSchema = z.object({
  item_name: z.string(),
  variant_name: z.string().nullable().optional(),
  quantity: z.number().int(),
  modifiers: z.array(itemModifierSchema).nullable().optional(),
  sides: z.array(itemSideSchema).nullable().optional(),
  note: z.string().nullable().optional(),
});

export const cancelTicketPayloadSchema = z.object({
  kind: z.literal("cancel_ticket"),
  order_number: z.string(),
  order_type: z.enum(["dine_in", "takeaway"]),
  table_number: z.number().int().nullable().optional(),
  /** Kitchen slot that originally received the item (1 or 2). */
  slot: z.number().int().min(1).max(2),
  /** Array to leave room for a future batched order-level cancel; today
   * always length 1. */
  items: z.array(cancelItemSchema).min(1),
  /** Free-text reason entered by the waiter/cashier in the void dialog. */
  reason: z.string(),
  /** Display name of the staff who voided the item (from profiles). */
  voided_by: z.string().optional(),
  printed_at: z.string(),
});

// ─── Shift close report (PHIẾU CHỐT CA) ──────────────────────────────────

const paymentBreakdownLineSchema = z.object({
  method: z.string(),
  count: z.number().int(),
  amount: z.number(),
});

export const shiftCloseReportPayloadSchema = z.object({
  kind: z.literal("shift_close_report"),
  branch_name: z.string().optional(),
  branch_address: z.string().optional(),
  branch_phone: z.string().optional(),
  branch_tax_code: z.string().nullable().optional(),
  session_id: z.number().int(),
  /** full_name của người đóng ca (closed_by). */
  cashier_name: z.string().optional(),
  opened_at: z.string(),
  closed_at: z.string(),
  opening_cash: z.number(),
  closing_cash: z.number(),
  expected_cash: z.number(),
  /** closing_cash - expected_cash. Negative = thiếu, positive = thừa. */
  cash_difference: z.number(),
  /** Free-text note from cashier (optional). */
  note: z.string().nullable().optional(),
  /** Lý do duyệt khi |cash_difference| vượt ngưỡng. Null khi trong ngưỡng. */
  variance_note: z.string().nullable().optional(),
  /** full_name người duyệt. Null khi không cần duyệt. */
  variance_approver: z.string().nullable().optional(),
  paid_order_count: z.number().int(),
  /** Đơn unpaid carry-over sang ca sau (D1 semantics). */
  unpaid_order_count: z.number().int(),
  cancelled_order_count: z.number().int(),
  /** Per-method aggregation: {cash, vietqr, momo, ...}. */
  payment_breakdown: z.array(paymentBreakdownLineSchema),
  /** Sum of paid orders.total_amount. */
  total_revenue: z.number(),
  printed_at: z.string(),
});

// ─── Union ───────────────────────────────────────────────────────────────

export const printPayloadSchema = z.discriminatedUnion("kind", [
  kitchenTicketPayloadSchema,
  provisionalBillPayloadSchema,
  receiptPayloadSchema,
  cancelTicketPayloadSchema,
  shiftCloseReportPayloadSchema,
]);

export type KitchenTicketPayload = z.infer<typeof kitchenTicketPayloadSchema>;
export type ProvisionalBillPayload = z.infer<typeof provisionalBillPayloadSchema>;
export type ReceiptPayload = z.infer<typeof receiptPayloadSchema>;
export type CancelTicketPayload = z.infer<typeof cancelTicketPayloadSchema>;
export type ShiftCloseReportPayload = z.infer<typeof shiftCloseReportPayloadSchema>;
export type PrintPayload = z.infer<typeof printPayloadSchema>;
