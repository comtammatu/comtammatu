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

function section(path: string, start: string, end: string): string {
  const source = read(path);
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${start} not found in ${path}`);
  const to = source.indexOf(end, from);
  assert.ok(to >= 0, `${end} not found in ${path}`);
  return source.slice(from, to);
}

function assertActionCallsDoNotSendUnit(
  path: string,
  callName: string,
): void {
  const source = read(path);
  const calls = source.matchAll(
    new RegExp(`${callName}\\(\\{[\\s\\S]*?\\}\\);`, "g"),
  );
  let count = 0;
  for (const call of calls) {
    count++;
    assert.doesNotMatch(call[0], /\bunit\s*:/, `${path} ${callName}`);
  }
  assert.ok(count > 0, `${callName} not found in ${path}`);
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

test("transaction write callers do not send unit text/code", () => {
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
    assert.doesNotMatch(
      read(path),
      /\bunit:\s*z\.string\(\)\.optional\(\)/,
      path,
    );
  }

  for (const [path, callName] of [
    [
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
      "upsertGrnLine",
    ],
    [
      "apps/web/app/(protected)/inventory/grn/[id]/_hooks/use-grn-line-actions.ts",
      "upsertGrnLine",
    ],
    [
      "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
      "upsertGrnLine",
    ],
    [
      "apps/web/app/(protected)/inventory/purchase-orders/new/new-po-client.tsx",
      "createPurchaseOrderWithLines",
    ],
    [
      "apps/web/app/(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx",
      "upsertPurchaseOrderLine",
    ],
    [
      "apps/web/app/(protected)/inventory/production-order-form.tsx",
      "createProductionOrder",
    ],
    [
      "apps/web/app/(protected)/inventory/production-recipe-panel.tsx",
      "upsertProductionRecipeLines",
    ],
    [
      "apps/web/app/(protected)/inventory/recipes/recipe-line-dialog.tsx",
      "upsertRecipeLines",
    ],
    [
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
      "upsertStockIssueLine",
    ],
    [
      "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
      "upsertStockIssueLine",
    ],
    [
      "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
      "createWasteEntry",
    ],
    [
      "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
      "createStockTransfer",
    ],
  ] as const) {
    assertActionCallsDoNotSendUnit(path, callName);
  }
});

test("direct table writes derive persisted unit text from the entry unit catalog", () => {
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
  ]) {
    const source = read(path);
    assert.match(source, /resolveEntryUnitCode/, path);
    assert.match(source, /unit:\s*resolvedUnit\.unit/, path);
    assert.doesNotMatch(source, /fallbackUnit/, path);
  }
});

test("RPC-backed inventory writes let the RPC derive persisted unit text", () => {
  for (const path of [
    "apps/web/app/(protected)/inventory/production-order-actions.ts",
    "apps/web/app/(protected)/inventory/waste-actions.ts",
    "apps/web/app/(protected)/inventory/recipe-actions.ts",
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /resolveEntryUnitCode/, path);
    assert.doesNotMatch(source, /unit:\s*resolvedUnit\.unit/, path);
  }
  assert.doesNotMatch(
    read("apps/web/app/(protected)/inventory/transfer-actions.ts"),
    /unit:\s*resolvedUnit\.unit/,
  );

  const createPo = section(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
    "export const createPurchaseOrderWithLines",
    "/* ─── fetchPurchaseOrderDetail",
  );
  assert.doesNotMatch(createPo, /resolveEntryUnitCode/);
  assert.doesNotMatch(createPo, /\bunit\s*:/);
  assert.match(createPo, /entry_unit_id:\s*line\.entryUnitId \?\? null/);
});

test("inventory RPCs derive persisted unit text from the unit catalog", () => {
  const migration = read(
    "supabase/migrations/_archive/20260704193015_inventory_unit_rpc_contract.sql",
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
    /\bp_unit:/,
  );
});

test("expiry writeoff RPC does not accept a unit text argument", () => {
  const migration = read(
    "supabase/migrations/_archive/20260704200923_inventory_drop_expiry_writeoff_unit_arg.sql",
  );
  const bridge = read(
    "supabase/migrations/_archive/20260704214448_inventory_expiry_writeoff_optional_unit_bridge.sql",
  );
  const baseline = read("supabase/migrations/00000000000000_baseline.sql");
  const action = read("apps/web/app/(protected)/inventory/waste-actions.ts");

  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.create_expiry_writeoff\([\s\S]*?text[\s\S]*?\);/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_expiry_writeoff\([\s\S]*?p_unit text/,
  );
  assert.doesNotMatch(
    baseline,
    /CREATE FUNCTION public\.create_expiry_writeoff\([\s\S]*?p_unit text/,
  );
  assert.doesNotMatch(action, /\bp_unit:/);
  assert.match(bridge, /to_regprocedure\(/);
  assert.match(bridge, /p_unit text DEFAULT NULL::text/);
  assert.match(bridge, /RETURN;/);
});

test("production recipe bulk import stores catalog-derived units", () => {
  const migration = read(
    "supabase/migrations/_archive/20260704193015_inventory_unit_rpc_contract.sql",
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

test("stock transfer receive converts received entry quantities to base units", () => {
  const sql = read(
    "supabase/migrations/20260706071001_stock_transfer_receive_base_quantity.sql",
  );
  const fnStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.stock_transfer_receive",
  );
  assert.ok(fnStart >= 0, "stock_transfer_receive override not found");
  const fnBody = sql.slice(
    fnStart,
    sql.indexOf("REVOKE ALL ON FUNCTION public.stock_transfer_receive", fnStart),
  );

  assert.match(fnBody, /v_recv_base\s+NUMERIC\(15,3\)/);
  assert.match(
    fnBody,
    /v_recv_base := public\.inv_to_base\(v_line\.ingredient_id, v_line\.entry_unit_id, v_recv\)::NUMERIC\(15,3\);/,
  );
  assert.match(fnBody, /'transfer_in', v_recv_base/);
  assert.doesNotMatch(fnBody, /'transfer_in', v_recv,/);
  assert.match(fnBody, /entry_unit_id, entry_quantity/);
  assert.match(fnBody, /v_line\.entry_unit_id, v_recv/);

  assert.match(sql, /sm\.entry_unit_id IS NULL/);
  assert.match(sql, /sm\.entry_quantity IS NULL/);
  assert.match(
    sql,
    /ABS\(sm\.quantity_change - COALESCE\(sti\.quantity_received, sti\.quantity\)\) <= 0\.0005/,
  );
  assert.match(sql, /current_quantity = sl\.current_quantity \+ agg\.delta/);
});

test("GRN amend and legacy GRN movements use base quantities", () => {
  const sql = read(
    "supabase/migrations/20260706084233_grn_base_quantity_legacy_cleanup.sql",
  );
  const fnStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.amend_grn_line");
  assert.ok(fnStart >= 0, "amend_grn_line override not found");
  const fnBody = sql.slice(fnStart, sql.indexOf("DO $$", fnStart));

  assert.match(
    fnBody,
    /v_old_net_base := public\.inv_to_base\(v_line\.ingredient_id, v_line\.entry_unit_id, v_old_net\);/,
  );
  assert.match(
    fnBody,
    /v_new_net_base := public\.inv_to_base\(v_line\.ingredient_id, v_line\.entry_unit_id, v_new_net\);/,
  );
  assert.match(fnBody, /v_delta_base := v_new_net_base - v_old_net_base;/);
  assert.match(
    fnBody,
    /WHERE tenant_id = v_tenant[\s\S]*location_id = v_location_id[\s\S]*ingredient_id = v_line\.ingredient_id/,
  );
  assert.match(fnBody, /'grn_amend',\s*\n\s*v_delta_base/);
  assert.match(fnBody, /entry_unit_id, entry_quantity/);
  assert.match(fnBody, /v_line\.entry_unit_id, ABS\(v_delta_qty\)/);
  assert.doesNotMatch(fnBody, /'grn_amend',\s*\n\s*v_delta_qty/);

  assert.match(sql, /grn_entry_unit_backfill_missing_conversion/);
  assert.match(sql, /grn_amend_backfill_requires_manual_review/);
  assert.match(sql, /sm\.type = 'grn_receipt'/);
  assert.match(sql, /COALESCE\(sm\.entry_unit_id, gi\.entry_unit_id\)/);
  assert.match(sql, /SET quantity_change = CASE/);
  assert.match(sql, /unit_cost = targets\.expected_unit_cost/);
  assert.match(sql, /entry_unit_id = targets\.entry_unit_id/);
  assert.match(sql, /entry_quantity = targets\.entry_quantity/);
  assert.match(sql, /current_quantity = sl\.current_quantity \+ agg\.delta/);
  assert.match(sql, /avg_unit_cost = CASE/);
});
