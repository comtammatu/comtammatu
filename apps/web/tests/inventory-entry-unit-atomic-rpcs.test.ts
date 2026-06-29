import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

function escaped(pattern: string): RegExp {
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

test("inventory entry units are persisted inside atomic RPCs", () => {
  const sql = read(
    "supabase/migrations/20260629125621_persist_entry_unit_in_atomic_rpcs.sql",
  );

  for (const table of [
    "public.production_order_items",
    "public.stock_transfer_items",
    "public.production_recipes",
    "public.recipes",
  ]) {
    assert.match(sql, new RegExp(`INSERT INTO ${table}[\\s\\S]*entry_unit_id`));
  }

  assert.equal(
    (sql.match(/entry_unit_id = EXCLUDED\.entry_unit_id/g) ?? []).length,
    4,
  );

  for (const key of [
    "line->>'entryUnitId'",
    "line.value->>'entryUnitId'",
    "v_line->>'entry_unit_id'",
  ]) {
    assert.match(sql, escaped(key), key);
  }
});

test("server actions do not patch entry units after RPC success", () => {
  for (const path of [
    "apps/web/app/(protected)/inventory/production-order-actions.ts",
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
    "apps/web/app/(protected)/inventory/recipe-actions.ts",
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /\.update\(\{\s*entry_unit_id/s, path);
    assert.doesNotMatch(source, /error:\s*(?:error|rpcError)\.message/, path);
  }
});

test("server action payload keys match the RPC contract", () => {
  const actionPayloads = new Map([
    [
      "apps/web/app/(protected)/inventory/production-order-actions.ts",
      "entryUnitId: item.entryUnitId ?? null",
    ],
    [
      "apps/web/app/(protected)/inventory/transfer-actions.ts",
      "entryUnitId: line.entryUnitId ?? null",
    ],
    [
      "apps/web/app/(protected)/inventory/recipe-actions.ts",
      "entry_unit_id: l.entryUnitId ?? null",
    ],
    [
      "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
      "entry_unit_id: line.entryUnitId ?? null",
    ],
  ]);

  for (const [path, payloadLine] of actionPayloads) {
    assert.match(read(path), escaped(payloadLine));
  }
});

test("employee count slip prefill preserves the submitted entry unit", () => {
  const sql = read(
    "supabase/migrations/20260629144912_employee_count_slip_entry_unit_prefill.sql",
  );

  assert.match(sql, /entry_unit_id\s+BIGINT/);
  assert.match(
    sql,
    /SELECT\s+l\.ingredient_id,\s+l\.counted_quantity,\s+l\.entry_unit_id,\s+l\.note/s,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_my_count_slip\(BIGINT\) FROM PUBLIC, anon/,
  );
});
