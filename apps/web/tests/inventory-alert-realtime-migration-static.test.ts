import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("inventory alerts use current thresholds, stable deduplication, and service-only jobs", () => {
  const migration = read(
    "supabase/migrations/20260802111528_repair_inventory_alert_notifications.sql",
  );

  assert.match(migration, /sum\(stock\.current_quantity\)/);
  assert.match(migration, /ingredient\.min_stock_level/);
  assert.doesNotMatch(migration, /ingredient\.reorder_point/);
  assert.match(migration, /inventory\.stock_low:%s:%s/);
  assert.match(migration, /DELETE FROM public\.notification_reads/);
  assert.match(migration, /inventory\.stocktake_conflict/);
  assert.match(migration, /inventory\.stocktake_completed/);
  assert.match(migration, /Asia\/Ho_Chi_Minh/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated;/);
});

test("branch operations broadcast request, production, and stocktake child changes", () => {
  const migration = read(
    "supabase/migrations/20260802111529_extend_inventory_branch_ops_realtime.sql",
  );

  for (const table of ["stock_requests", "purchase_requests", "production_runs"]) {
    assert.match(
      migration,
      new RegExp(`ON public\\.${table}[\\s\\S]*public\\.broadcast_branch_ops`),
    );
  }
  assert.match(migration, /ADD COLUMN IF NOT EXISTS updated_at timestamptz/);
  assert.match(migration, /touch_stocktake_session_after_line_change/);
  assert.match(migration, /touch_stocktake_session_after_conflict_change/);
});
