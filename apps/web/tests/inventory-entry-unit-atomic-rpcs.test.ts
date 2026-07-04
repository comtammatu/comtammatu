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
    "supabase/migrations/_archive/20260629125621_persist_entry_unit_in_atomic_rpcs.sql",
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
      "entry_unit_id: line.entryUnitId ?? null",
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

test("server actions derive persisted unit text from the entry unit catalog", () => {
  const helper = read(
    "apps/web/app/(protected)/inventory/_lib/entry-unit-code.ts",
  );

  assert.match(helper, /\.eq\("unit_id", entryUnitId\)/);
  assert.match(helper, /\.eq\("is_base", true\)/);
  assert.match(helper, /\.eq\("ingredient_id", ingredientId\)/);
  assert.match(helper, /\.eq\("tenant_id", tenantId\)/);
  assert.doesNotMatch(helper, /\.eq\("id", entryUnitId\)/);
  assert.doesNotMatch(helper, /fallbackUnit/);

  for (const path of [
    "apps/web/app/(protected)/inventory/grn-actions.ts",
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
    "apps/web/app/(protected)/inventory/issue-actions.ts",
    "apps/web/app/(protected)/inventory/waste-actions.ts",
    "apps/web/app/(protected)/inventory/production-order-actions.ts",
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
    "apps/web/app/(protected)/inventory/recipe-actions.ts",
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  ]) {
    const source = read(path);
    assert.match(source, /resolveEntryUnitCode/, path);
    assert.match(source, /unit:\s*resolvedUnit\.unit/, path);
    assert.doesNotMatch(source, /fallbackUnit/, path);
  }
});

test("inventory RPCs derive persisted unit text from the unit catalog", () => {
  const migration = read(
    "supabase/migrations/20260704193015_inventory_unit_rpc_contract.sql",
  );
  const baseline = read("supabase/migrations/00000000000000_baseline.sql");

  for (const sql of [migration, baseline]) {
    assert.match(sql, /inventory_entry_unit_code/);
    assert.match(sql, /iu\.unit_id = p_entry_unit_id/);
    assert.match(sql, /iu\.is_base = TRUE/);
    assert.doesNotMatch(sql, /iu\.id = p_entry_unit_id/);
  }

  for (const sql of [migration, baseline]) {
    assert.doesNotMatch(sql, /NULLIF\(btrim\(line->>'unit'\), ''\)/i);
    assert.doesNotMatch(sql, /line \? 'finishedGoodId' AND line \? 'quantity' AND line \? 'unit'/);
    assert.doesNotMatch(sql, /\bx\.unit\b/);
    assert.doesNotMatch(sql, /line\.value \? 'unit'/);
    assert.doesNotMatch(sql, /line\.value->>'unit'/);
    assert.doesNotMatch(sql, /COALESCE\(v_item->>'unit', 'kg'\)/);
    assert.doesNotMatch(sql, /btrim\(v_line->>'unit'\)/);
  }

  assert.doesNotMatch(
    read("apps/web/app/(protected)/inventory/waste-actions.ts"),
    /p_unit:\s*parsed\.data\.unit/,
  );
});

test("production recipe bulk import stores catalog-derived units", () => {
  const migration = read(
    "supabase/migrations/20260704193015_inventory_unit_rpc_contract.sql",
  );
  const fnStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.bulk_import_production_recipes",
  );
  assert.ok(fnStart >= 0, "bulk_import_production_recipes override not found");
  const fnBody = migration.slice(fnStart, fnStart + 7000);

  assert.match(
    fnBody,
    /public\.inventory_entry_unit_code\(v_tenant, lines\.ingredient_id, lines\.entry_unit_id\)/,
  );
  assert.doesNotMatch(fnBody, /raw\.value->>'unit'/);
  assert.doesNotMatch(fnBody, /lines\.unit/);

  const action = read(
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  );
  assert.match(action, /resolveImportEntryUnit\(ingredient, unitRaw\)/);
  assert.match(action, /entry_unit_id:\s*line\.entryUnitId/);
});

test("employee count slip prefill preserves the submitted entry unit", () => {
  const sql = read(
    "supabase/migrations/_archive/20260629144912_employee_count_slip_entry_unit_prefill.sql",
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
