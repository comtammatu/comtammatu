import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readSql(repoRoot, path);

const migration = read(
  "supabase/migrations/20260828200000_kds_completion_immediate_stock_deduction.sql",
);

test("kds immediate stock deduction: does not block on order status or payment status", () => {
  assertSqlNotMatch(migration,
    /v_order\.payment_status,\s*'unpaid'\)\s*<>\s*'paid'/,
  );
  assertSqlNotMatch(migration, /v_order\.status\s*<>\s*'completed'/);
  assertSqlNotMatch(migration, /reason',\s*'order_not_paid_completed'/);
  assertSqlNotMatch(migration, /reason',\s*'kds_not_fully_ready'/);
});

test("kds immediate stock deduction: uses delta posting for progressive completion", () => {
  assertSqlMatch(migration, /already_posted AS/);
  assertSqlMatch(migration, /posted_qty/);
  assertSqlMatch(migration,
    /\(en\.total_need_qty\s*-\s*COALESCE\(ap\.posted_qty,\s*0\)\)::numeric\(15,3\)\s*AS\s*need_qty/,
  );
  assertSqlMatch(migration,
    /WHERE\s*\(en\.total_need_qty\s*-\s*COALESCE\(ap\.posted_qty,\s*0\)\)\s*>\s*0/,
  );
});

test("kds immediate stock deduction: replaces unique index with non-unique lookup index", () => {
  assertSqlMatch(migration,
    /DROP INDEX IF EXISTS public\.idx_stock_movements_pos_outcome_idempotency;/,
  );
  assertSqlMatch(migration,
    /CREATE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_lookup/,
  );
  assertSqlNotMatch(migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_lookup/,
  );
});

test("kds immediate stock deduction: post_pos_cancelled_ready_waste skips if already consumed by KDS", () => {
  assertSqlMatch(migration,
    /sm\.movement_subtype IN \('sale_consumption',\s*'cancelled_after_kds_ready'\)/,
  );
});

test("kds immediate stock deduction: backfill automatically processes open orders with ready items", () => {
  assertSqlMatch(migration, /DO \$backfill_open_ready_orders\$/);
  assertSqlMatch(migration, /kt\.first_ready_at IS NOT NULL/);
  assertSqlMatch(migration, /PERFORM public\.post_pos_sale_consumption_if_ready\(/);
});

