import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("POS item-discount schema and RPC contract is present in migration chain", () => {
  const baseline = read("supabase/migrations/00000000000000_baseline.sql");
  const migration = read(
    "supabase/migrations/20260608090000_pos_item_discount_hddt_shift_close.sql",
  );
  const sql = `${baseline}\n${migration}`;

  // The lean baseline is V1–V17 self-consistent and now carries the item-level
  // discount schema directly; the forward migration mirrors it for prod cutover.
  // Item-level discount is a KEPT feature — it must be present in the chain.
  assert.match(
    baseline,
    /apply_order_item_discount/,
    "item-level discount is a kept feature and must be present in the lean baseline",
  );

  assert.match(sql, /item_discount_amount numeric\(15,2\) DEFAULT 0 NOT NULL/);
  assert.match(sql, /discount_type text/);
  assert.match(sql, /discount_value numeric\(15,2\)/);
  assert.match(sql, /discount_note text/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.recompute_order_totals/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.apply_order_item_discount/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.clear_order_item_discount/);
  assert.ok(
    sql.includes(
      "GREATEST(COALESCE(oi.subtotal, 0) - COALESCE(oi.discount_amount, 0), 0)",
    ),
    "VAT/report line bases must start from order_items net after item discount",
  );
  assert.ok(
    sql.includes(
      "COALESCE(v_order.discount_amount, 0) + COALESCE(v_order.item_discount_amount, 0)",
    ),
    "bill/receipt print payload must include order + item discount total",
  );
});
