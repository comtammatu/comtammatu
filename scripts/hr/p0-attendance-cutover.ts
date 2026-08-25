#!/usr/bin/env tsx
/**
 * ADR 0019 Phase P0 — attendance cutover script (Preview → Production).
 *
 * Deletes:
 * 1. All attendance before 2026-08-01
 * 2. All August 2026 attendance (full reset for re-roster + re-punch)
 *
 * Usage:
 *   DRY RUN (default): corepack pnpm tsx scripts/hr/p0-attendance-cutover.ts
 *   Apply:             corepack pnpm tsx scripts/hr/p0-attendance-cutover.ts --apply
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env.
 */

import { createClient } from "@supabase/supabase-js";

const PRE_AUG_CUTOFF = "2026-08-01";
const AUG_START = "2026-08-01";
const AUG_END = "2026-08-31";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count: preAugCount, error: preAugCountError } = await supabase
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .lt("date", PRE_AUG_CUTOFF);
  if (preAugCountError) throw preAugCountError;

  const { count: augCount, error: augCountError } = await supabase
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .gte("date", AUG_START)
    .lte("date", AUG_END);
  if (augCountError) throw augCountError;

  console.log(`Pre-Aug attendance rows: ${preAugCount ?? 0}`);
  console.log(`August 2026 attendance rows: ${augCount ?? 0}`);

  const { data: draftPeriods, error: draftError } = await supabase
    .from("payroll_periods")
    .select("id, period_year, period_month, status")
    .eq("period_year", 2026)
    .eq("period_month", 8)
    .eq("status", "draft");
  if (draftError) throw draftError;
  if ((draftPeriods ?? []).length > 0) {
    console.warn("Draft payroll period(s) for Aug 2026 exist:", draftPeriods);
  }

  if (!apply) {
    console.log("\nDRY RUN — pass --apply to delete rows.");
    return;
  }

  const { error: preAugDeleteError } = await supabase
    .from("attendance_records")
    .delete()
    .lt("date", PRE_AUG_CUTOFF);
  if (preAugDeleteError) throw preAugDeleteError;

  const { error: augDeleteError } = await supabase
    .from("attendance_records")
    .delete()
    .gte("date", AUG_START)
    .lte("date", AUG_END);
  if (augDeleteError) throw augDeleteError;

  console.log("Deleted attendance rows for pre-Aug and full August 2026.");
  console.log("Next: HR re-roster T8 + employees re-punch under Phase B rules.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
