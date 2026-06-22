/**
 * SQL parity contract for public.resolve_gtgt_rate
 * (supabase/migrations/_archive/20260616130000_derive_sales_tax_rate.sql).
 *
 * The SQL fn mirrors the TS resolver's GTGT tier logic for the INTERNAL
 * order_items.vat_rate snapshot. There is no live DB in unit tests; this file
 * is the behavioral reference. Each case below documents the exact rate the SQL
 * fn must return for a given (annualRevenue, date), derived from the same
 * canonical SoT (sales-tax-versions.ts) that drives resolveSalesTaxProfile.
 * If a case here changes, the SQL fn must be re-verified against prod.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolveSalesTaxProfile } from "../resolve-sales-tax";

interface SqlGtgtCase {
  readonly label: string;
  readonly annualRevenue: number;
  readonly date: string;
  /** Exact NUMERIC(5,2) points the SQL resolve_gtgt_rate must return. */
  readonly expectedRate: number;
}

// The SQL fn returns ONLY the GTGT rate (no TNCN). food_service is the
// production category for Má Tư; the resolver's gtgtRate is the contract.
const SQL_GTGT_CASES: readonly SqlGtgtCase[] = [
  // exempt tier (< 1 tỷ annualized) → 0 on any date
  { label: "exempt <1 tỷ in-window", annualRevenue: 800_000_000, date: "2026-06-16", expectedRate: 0 },
  { label: "exempt <1 tỷ post-window", annualRevenue: 800_000_000, date: "2027-01-01", expectedRate: 0 },
  // group2 (1–3 tỷ): 2.40 in temp-reduction window, 3.00 after
  { label: "group2 in-window → 2.40", annualRevenue: 2_000_000_000, date: "2026-06-16", expectedRate: 2.4 },
  { label: "group2 post-window → 3.00", annualRevenue: 2_000_000_000, date: "2027-01-01", expectedRate: 3.0 },
  // group3 (≥3 tỷ): same GTGT base as group2 (TNCN differs, not modeled in SQL)
  { label: "group3 in-window → 2.40", annualRevenue: 4_000_000_000, date: "2026-06-16", expectedRate: 2.4 },
  { label: "group3 post-window → 3.00", annualRevenue: 4_000_000_000, date: "2027-01-01", expectedRate: 3.0 },
  // window boundaries
  { label: "window open 2025-07-01 → 2.40", annualRevenue: 2_000_000_000, date: "2025-07-01", expectedRate: 2.4 },
  { label: "window close 2026-12-31 → 2.40", annualRevenue: 2_000_000_000, date: "2026-12-31", expectedRate: 2.4 },
  { label: "day after window 2027-01-01 → 3.00", annualRevenue: 2_000_000_000, date: "2027-01-01", expectedRate: 3.0 },
];

test("SQL resolve_gtgt_rate parity: each case matches the TS resolver gtgtRate", () => {
  for (const c of SQL_GTGT_CASES) {
    const profile = resolveSalesTaxProfile({
      annualRevenue: c.annualRevenue,
      effectiveDate: c.date,
      category: "food_service",
    });
    assert.equal(
      profile.gtgtRate,
      c.expectedRate,
      `${c.label}: expected ${c.expectedRate}, got ${profile.gtgtRate}`,
    );
  }
});
