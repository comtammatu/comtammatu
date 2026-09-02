import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

test("inventory alerts use current thresholds, stable deduplication, and service-only jobs", () => {
  const migration = read(
    "supabase/migrations/20260802111528_repair_inventory_alert_notifications.sql",
  );

  assertSqlMatch(migration, /sum\(stock\.current_quantity\)/);
  assertSqlMatch(migration, /ingredient\.min_stock_level/);
  assertSqlNotMatch(migration, /ingredient\.reorder_point/);
  assertSqlMatch(migration, /inventory\.stock_low:%s:%s/);
  assertSqlMatch(migration, /DELETE FROM public\.notification_reads/);
  assertSqlMatch(migration, /inventory\.stocktake_conflict/);
  assertSqlMatch(migration, /inventory\.stocktake_completed/);
  assertSqlMatch(migration, /Asia\/Ho_Chi_Minh/);
  assertSqlMatch(migration, /FROM PUBLIC, anon, authenticated;/);
});

test("branch operations broadcast request, production, and stocktake child changes", () => {
  const migration = read(
    "supabase/migrations/20260802111529_extend_inventory_branch_ops_realtime.sql",
  );

  for (const table of ["stock_requests", "purchase_requests", "production_runs"]) {
    assertSqlMatch(migration,
      new RegExp(`ON public\\.${table}[\\s\\S]*public\\.broadcast_branch_ops`),
    );
  }
  assertSqlMatch(migration, /ADD COLUMN IF NOT EXISTS updated_at timestamptz/);
  assertSqlMatch(migration, /touch_stocktake_session_after_line_change/);
  assertSqlMatch(migration, /touch_stocktake_session_after_conflict_change/);
});
