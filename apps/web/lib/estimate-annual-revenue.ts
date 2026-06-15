/**
 * estimateAnnualRevenue — YTD-annualized gross paid revenue (VND) for HKD
 * sales-tax tier classification. Mirrors the SQL resolve_gtgt_rate revenue calc:
 * sum of orders.total_amount over completed payments whose paid_at VN-date is in
 * the current year, divided by days-elapsed-in-year, times 365. Gross is
 * rate-independent (total_amount).
 *
 * Used by the finance invoice no-items header-VAT fallback to pick the GTGT
 * rate via resolveSalesTaxProfile. Keep in parity with public.resolve_gtgt_rate
 * (supabase/migrations/20260616130000_derive_sales_tax_rate.sql).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import { getVNDateParts } from "@comtammatu/shared/time";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// VN is UTC+7 with no DST → local midnight = 17:00 UTC the previous day.
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Midnight (start of day) in Asia/Ho_Chi_Minh for a VN calendar date, as a UTC ISO string. */
function vnMidnightUtcIso(year: number, month: number, day: number): string {
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - VN_UTC_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

export async function estimateAnnualRevenue(
  supabase: SupabaseClient<Database>,
  tenantId: number,
  asOf: Date = new Date(),
): Promise<number> {
  const { year, month, day } = getVNDateParts(asOf);

  const yearStartIso = vnMidnightUtcIso(year, 1, 1);
  // Upper bound = start of the day AFTER asOf (VN), exclusive — matches the
  // SQL `paid_at VN-date <= p_at_date`.
  const upperExclusiveIso = new Date(
    new Date(vnMidnightUtcIso(year, month, day)).getTime() + MS_PER_DAY,
  ).toISOString();

  const { data, error } = await supabase
    .from("payments")
    .select("orders!inner(total_amount, status, payment_status)")
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("paid_at", yearStartIso)
    .lt("paid_at", upperExclusiveIso)
    .neq("orders.status", "cancelled")
    .eq("orders.payment_status", "paid");

  if (error || !data) return 0;

  const ytdGross = data.reduce((sum, row) => {
    const order = row.orders as { total_amount: number | null } | null;
    return sum + Number(order?.total_amount ?? 0);
  }, 0);

  // Days elapsed in the VN year, inclusive of today.
  const daysElapsed =
    Math.round(
      (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY,
    ) + 1;

  if (daysElapsed <= 0) return ytdGross;
  return (ytdGross / daysElapsed) * 365;
}
