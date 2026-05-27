/**
 * Zod input schemas for POS server actions.
 *
 * Schemas live here so they can be referenced both by the wrapped
 * `withActionPositional(...)` declarations and (when needed) by client-side
 * pre-validation. The client `void-item-dialog.tsx` / `reduce-quantity-dialog.tsx`
 * already mirror the server `min(5)` rule by hand; long term those mirrors
 * should re-import the same schema instead of duplicating the constant.
 *
 * Originally inlined in `order-actions.ts`. Moved here as part of the
 * WS-1a / WS-1b refactor (see
 * `docs/worklog/shell-helpers-refactor-plan-2026-05-27.md`).
 */

import { z } from "zod";
import { cartModifierSchema, cartSideSchema } from "../types";

/**
 * Schema for `voidOrderItem(orderItemId, reason)`.
 *
 * `min(5)`: single-char "x" reasons defeat the audit trail. 5 is the floor
 * that still admits short legitimate reasons ("hết", "khách đổi") while
 * rejecting fat-finger noise. Stocktake escalation uses 20 (see rule
 * R4-ESCALATE-NOTE-MIN-CHARS); POS void is more frequent so 5 balances
 * operator friction with audit value.
 */
export const voidItemSchema = z.object({
  orderItemId: z.coerce.number().int().positive({ error: "Món không hợp lệ" }),
  reason: z
    .string()
    .trim()
    .min(5, { error: "Lý do hủy món tối thiểu 5 ký tự" }),
});

export type VoidItemInput = z.infer<typeof voidItemSchema>;

/**
 * Schema for `reduceOrderItemQuantity(orderItemId, newQuantity, reason)`.
 *
 * Stepper UI clamps client-side, server enforces 1..(currentQty-1). Coerce
 * because the dialog state stays a string until submit.
 *
 * `reason.min(5)` mirrors `voidItemSchema` so audit trail isn't defeated
 * by "x" reasons and so cashiers see the same UX rule across void / reduce.
 */
export const reduceItemSchema = z.object({
  orderItemId: z.coerce.number().int().positive({ error: "Món không hợp lệ" }),
  newQuantity: z.coerce
    .number()
    .int()
    .min(1, { error: "Số lượng mới tối thiểu 1" }),
  reason: z
    .string()
    .trim()
    .min(5, { error: "Lý do giảm SL tối thiểu 5 ký tự" }),
});

export type ReduceItemInput = z.infer<typeof reduceItemSchema>;

/**
 * Schema for `cancelOrder(orderId, reason)`. Mirrors `voidItemSchema.reason`
 * min length for audit consistency.
 */
export const cancelOrderSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Đơn không hợp lệ" }),
  reason: z
    .string()
    .trim()
    .min(5, { error: "Lý do hủy đơn tối thiểu 5 ký tự" }),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

/**
 * Schema for `editPendingOrderItem(orderItemId, input)`.
 *
 * `variantId` nullable: món có thể không có biến thể. `unitPrice`: server
 * cũng validate `>= 0`; client clamps để stepper-bound chặt. `note`: mirror
 * `cartItem.note` (optional, max 200 ký tự per `item-customizer` maxLength).
 */
export const editPendingItemSchema = z.object({
  orderItemId: z.coerce.number().int().positive({ error: "Món không hợp lệ" }),
  variantId: z.coerce.number().int().positive().nullable(),
  variantName: z.string().trim().max(100).nullable(),
  unitPrice: z.coerce.number().min(0, { error: "Đơn giá không hợp lệ" }),
  modifiers: z.array(cartModifierSchema),
  sides: z.array(cartSideSchema),
  note: z.string().max(200).nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(99),
});

export type EditPendingOrderItemInput = z.infer<typeof editPendingItemSchema>;
