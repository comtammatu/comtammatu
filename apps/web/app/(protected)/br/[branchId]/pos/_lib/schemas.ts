/**
 * Zod input schemas for POS server actions.
 *
 * Schemas live here so they can be referenced both by the wrapped
 * `withActionPositional(...)` declarations and (when needed) by client-side
 * pre-validation. The client `void-item-dialog.tsx` already mirrors the
 * server `min(5)` rule by hand; long term those mirrors should re-import
 * the same schema instead of duplicating the constant.
 *
 * Originally inlined in `order-actions.ts`. Moved here as part of the
 * WS-1a proving slice (see
 * `docs/worklog/shell-helpers-refactor-plan-2026-05-27.md`).
 */

import { z } from "zod";

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
