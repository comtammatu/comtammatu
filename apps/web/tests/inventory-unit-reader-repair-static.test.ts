import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const prodBaseline = readFileSync(
  resolve(
    repoRoot,
    "supabase/migrations/00000000000000_baseline.sql",
  ),
  "utf8",
);
const actions = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  ),
  "utf8",
);

function readPgDumpObject(source: string, createPrefix: string): string {
  const start = source.indexOf(createPrefix);
  assert.notEqual(start, -1, `missing pg_dump object: ${createPrefix}`);
  const end = source.indexOf("\n\n--\n-- Name:", start + createPrefix.length);
  assert.notEqual(end, -1, `unterminated pg_dump object: ${createPrefix}`);
  return source.slice(start, end);
}

test("inventory readers use the canonical base-unit contract", () => {
  const scanInventoryAlerts = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.scan_inventory_alerts(",
  );
  const stockMovementReport = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.get_stock_movement_report(",
  );
  const blindStocktakeLines = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.get_stocktake_lines_blind(",
  );
  const readerRpcs = `${scanInventoryAlerts}\n${stockMovementReport}\n${blindStocktakeLines}`;

  assert.match(scanInventoryAlerts, /CREATE FUNCTION public\.scan_inventory_alerts/);
  assert.match(stockMovementReport, /CREATE FUNCTION public\.get_stock_movement_report/);
  assert.match(blindStocktakeLines, /CREATE FUNCTION public\.get_stocktake_lines_blind/);
  assert.doesNotMatch(readerRpcs, /\bing\.unit\b/);
  assert.match(
    stockMovementReport,
    /public\.inventory_entry_unit_code\(v_tenant, ing\.id, NULL\)/,
  );
  assert.match(
    blindStocktakeLines,
    /public\.inventory_entry_unit_code\(v_tenant, ing\.id, NULL\)/,
  );
  assert.match(scanInventoryAlerts, /'inventory\.stock_low'/);
  assert.match(
    scanInventoryAlerts,
    /ON CONFLICT \(tenant_id, dedup_key\)\s+WHERE dedup_key IS NOT NULL\s+DO NOTHING/,
  );
});

test("recipe entry-unit references cannot be removed silently", () => {
  const guardRpc = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.prevent_recipe_entry_unit_invalidation(",
  );

  assert.match(
    guardRpc,
    /CREATE FUNCTION public\.prevent_recipe_entry_unit_invalidation/,
  );
  assert.match(guardRpc, /FROM public\.recipes r/);
  assert.match(guardRpc, /r\.entry_unit_id = OLD\.unit_id/);
  assert.match(guardRpc, /FROM public\.production_recipes pr/);
  assert.match(
    prodBaseline,
    /CREATE TRIGGER trg_prevent_recipe_entry_unit_delete/,
  );
  assert.match(actions, /ingredient_unit_in_use_by_recipe/);
  assert.match(actions, /công thức sản xuất hoặc công thức món/);
});
