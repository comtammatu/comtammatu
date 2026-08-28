import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const migration = read(
  "supabase/migrations/20260828200000_kds_completion_immediate_stock_deduction.sql",
);

test("kds immediate stock deduction: does not block on order status or payment status", () => {
  assert.doesNotMatch(
    migration,
    /v_order\.payment_status,\s*'unpaid'\)\s*<>\s*'paid'/,
  );
  assert.doesNotMatch(migration, /v_order\.status\s*<>\s*'completed'/);
  assert.doesNotMatch(migration, /reason',\s*'order_not_paid_completed'/);
  assert.doesNotMatch(migration, /reason',\s*'kds_not_fully_ready'/);
});

test("kds immediate stock deduction: uses delta posting for progressive completion", () => {
  assert.match(migration, /already_posted AS/);
  assert.match(migration, /posted_qty/);
  assert.match(
    migration,
    /\(en\.total_need_qty\s*-\s*COALESCE\(ap\.posted_qty,\s*0\)\)::numeric\(15,3\)\s*AS\s*need_qty/,
  );
  assert.match(
    migration,
    /WHERE\s*\(en\.total_need_qty\s*-\s*COALESCE\(ap\.posted_qty,\s*0\)\)\s*>\s*0/,
  );
});

test("kds immediate stock deduction: replaces unique index with non-unique lookup index", () => {
  assert.match(
    migration,
    /DROP INDEX IF EXISTS public\.idx_stock_movements_pos_outcome_idempotency;/,
  );
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_lookup/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_lookup/,
  );
});

test("kds immediate stock deduction: post_pos_cancelled_ready_waste skips if already consumed by KDS", () => {
  assert.match(
    migration,
    /sm\.movement_subtype IN \('sale_consumption',\s*'cancelled_after_kds_ready'\)/,
  );
});

test("kds immediate stock deduction: backfill automatically processes open orders with ready items", () => {
  assert.match(migration, /DO \$backfill_open_ready_orders\$/);
  assert.match(migration, /kt\.first_ready_at IS NOT NULL/);
  assert.match(migration, /PERFORM public\.post_pos_sale_consumption_if_ready\(/);
});

