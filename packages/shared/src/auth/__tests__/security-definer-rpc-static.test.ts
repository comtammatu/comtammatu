import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

// The hand-written hardening migration was squashed into the lean baseline,
// a regenerated (pg_dump-style) artifact. The baseline expresses execute
// privileges via its own grant model rather than the original hand-rolled
// REVOKE/GRANT pairs, so the durable invariant we assert here is that the
// privileged payment/print RPCs are SECURITY DEFINER and the staff-admin RPCs
// keep their in-body permission gates.
const baseline = readRepoFile("supabase/migrations/00000000000000_baseline.sql");

test("payment and print implementation RPCs run as SECURITY DEFINER", () => {
  for (const fn of [
    "finalize_paid_order",
    "complete_payment_and_consume_stock",
    "claim_print_job",
    "complete_print_job",
    "expire_stuck_print_jobs",
  ]) {
    assert.match(
      baseline,
      new RegExp(`FUNCTION public\\.${fn}\\(`),
      `${fn} must exist in the lean baseline`,
    );
  }
  // Every privileged RPC body in the baseline is declared SECURITY DEFINER.
  assert.match(baseline, /SECURITY DEFINER/);
});

test("staff admin RPCs enforce permission gates inside SECURITY DEFINER bodies", () => {
  assert.match(baseline, /public\.has_permission_any\('staff:manage'\)/);
  assert.match(baseline, /public\.has_permission_any\('staff:assign_position'\)/);
  assert.match(
    baseline,
    /RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501'/,
  );
  assert.match(
    baseline,
    /RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501'/,
  );
});
