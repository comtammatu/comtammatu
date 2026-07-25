"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";

/* ─── Types & Zod schemas ──────────────────────────────────────────────── */

const numericLike = z.union([z.number(), z.string()]).transform((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
});

const nullableNumericLike = numericLike.nullable();

const sessionShape = z.object({
  id: z.number().int(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  status: z.string(),
  terminal_name: z.string().nullable(),
  opened_by_name: z.string().nullable(),
  closed_by_name: z.string().nullable(),
  opening_cash: numericLike,
  closing_cash: nullableNumericLike,
  expected_cash: nullableNumericLike,
  cash_difference: nullableNumericLike,
  note: z.string().nullable(),
  variance_approval_note: z.string().nullable(),
});

const totalsShape = z.object({
  gross_revenue: numericLike,
  discount_total: numericLike,
  tax_total: numericLike,
  service_charge_total: numericLike,
  net_revenue: numericLike,
  cash_revenue: numericLike,
  noncash_revenue: numericLike,
  paid_order_count: z.number().int(),
  unpaid_order_count: z.number().int(),
  cancelled_order_count: z.number().int(),
  void_item_count: z.number().int(),
  total_items: z.number().int(),
  item_row_count: z.number().int(),
  item_quantity: z.number().int(),
  main_dish_quantity: z.number().int(),
  side_dish_quantity: z.number().int(),
  included_side_quantity: z.number().int(),
  served_item_quantity: z.number().int(),
  legacy_unclassified_quantity: z.number().int(),
  legacy_current_main_dish_quantity: z.number().int(),
  aov: numericLike,
});

const paymentMixItem = z.object({
  method: z.string().nullable(),
  count: z.number().int(),
  order_count: z.number().int(),
  amount: numericLike,
});

const topItem = z.object({
  name: z.string(),
  source: z.enum(["main", "side", "modifier"]),
  qty: z.number().int(),
  revenue: numericLike,
});

const categoryItem = z.object({
  category_id: z.number().int(),
  category_name: z.string(),
  qty: z.number().int(),
  revenue: numericLike,
});

const aovBin = z.object({
  label: z.string(),
  count: z.number().int(),
});

const hourlyBucket = z.object({
  hour: z.number().int(),
  order_count: z.number().int(),
  payment_count: z.number().int(),
  revenue: numericLike,
});

const peakHour = z
  .object({
    hour: z.number().int(),
    order_count: z.number().int(),
    payment_count: z.number().int(),
    revenue: numericLike,
  })
  .nullable();

const discountOrder = z.object({
  order_id: z.number().int(),
  order_number: z.string(),
  amount: numericLike,
  note: z.string().nullable(),
  type: z.string().nullable(),
  value: nullableNumericLike,
});

const discountsShape = z.object({
  count: z.number().int(),
  total: numericLike,
  top_orders: z.array(discountOrder),
});

const paymentAttemptSummaryShape = z.object({
  total: z.number().int(),
  completed: z.number().int(),
  pending: z.number().int(),
  failed: z.number().int(),
  refunded: z.number().int(),
});

const operationalEvidenceShape = z.object({
  kds_event_count: z.number().int(),
  kds_completed_item_quantity: z.number().int(),
  kds_legacy_completed_item_quantity: z.number().int(),
  print_job_count: z.number().int(),
  printed_job_count: z.number().int(),
  print_failed_count: z.number().int(),
  invoice_count: z.number().int(),
  invoice_attention_count: z.number().int(),
  audit_event_count: z.number().int(),
  order_payment_state_mismatch_count: z.number().int(),
  late_payment_count: z.number().int(),
  late_payment_amount: numericLike,
});

const reportSchema = z.object({
  session: sessionShape,
  totals: totalsShape,
  payment_mix: z.array(paymentMixItem),
  top_items: z.array(topItem),
  category_breakdown: z.array(categoryItem),
  aov_bins: z.array(aovBin),
  hourly: z.array(hourlyBucket),
  peak_hour: peakHour,
  discounts: discountsShape,
  payment_attempt_summary: paymentAttemptSummaryShape,
  operational_evidence: operationalEvidenceShape,
  generated_at: z.string(),
});

export type PosSessionReport = z.infer<typeof reportSchema>;

/* ─── Server action ────────────────────────────────────────────────────── */

const inputSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
});

/**
 * Trả aggregate báo cáo của 1 ca POS — top items decompose combo, category
 * breakdown, peak hour (Asia/Ho_Chi_Minh), AOV bins, payment mix, discount
 * detail. Gate: super/area/branch_manager (cashier không xem báo cáo — D6).
 */
export async function getPosSessionReport(
  sessionId: number,
): Promise<ActionResult<PosSessionReport>> {
  const parsed = inputSchema.safeParse({ sessionId });
  if (!parsed.success) {
    return { success: false, error: "Session ID không hợp lệ" };
  }

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    return { success: false, error: "Không có quyền xem báo cáo ca" };
  }

  const { data, error } = await supabase.rpc("get_pos_session_report", {
    p_session_id: parsed.data.sessionId,
  });

  if (error) {
    return {
      success: false,
      error: error.message.includes("session_not_found")
        ? "Không tìm thấy ca"
        : messages.settings.branch.posSessionReportLoadFailed,
    };
  }

  const validated = reportSchema.safeParse(data);
  if (!validated.success) {
    return {
      success: false,
      error: "Dữ liệu báo cáo ca không hợp lệ",
    };
  }

  return {
    success: true,
    data: {
      ...validated.data,
      top_items: [...validated.data.top_items].sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.qty - a.qty ||
          a.name.localeCompare(b.name),
      ),
    },
  };
}
