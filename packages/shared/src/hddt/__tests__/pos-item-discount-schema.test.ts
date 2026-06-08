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

  assert.doesNotMatch(
    baseline,
    /apply_order_item_discount/,
    "lean baseline is a regenerated artifact; item-discount schema must live in a forward migration until prod-first regen",
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
