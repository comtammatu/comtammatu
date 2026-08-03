import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getDefaultIssueUnit,
  getIssueUnitOptions,
} from "../app/(protected)/inventory/_lib/issue-units";
import {
  formatStockUnits,
  resolveStockDisplayUnit,
  toStockDisplayQuantity,
  toStockDisplayUnitCost,
} from "../app/(protected)/inventory/_lib/stock-unit-format";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "../lib/inventory/purchase-units";
import type { IngredientUnitRow } from "../lib/inventory/types";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function unit(row: Partial<IngredientUnitRow>): IngredientUnitRow {
  return {
    id: 0,
    unit_id: 0,
    unit_code: "",
    to_base_factor: 1,
    is_base: false,
    is_active: true,
    sort_order: 0,
    ...row,
  };
}

const ingredient = {
  units: [
    unit({
      unit_id: 100,
      unit_code: "ml",
      unit_name: "ml",
      to_base_factor: 1,
      is_base: true,
      sort_order: 0,
    }),
    unit({
      unit_id: 200,
      unit_code: "chai",
      unit_name: "chai",
      to_base_factor: 330,
      sort_order: 1,
    }),
    unit({
      unit_id: 300,
      unit_code: "thung",
      unit_name: "thùng",
      to_base_factor: 7920,
      sort_order: 2,
    }),
  ],
};

test("purchase and issue pickers expose every active unit and default to standard", () => {
  const purchase = getPurchaseUnitOptions(ingredient);
  assert.deepEqual(
    purchase.map((o) => o.unitId),
    [100, 200, 300],
  );
  assert.equal(getDefaultPurchaseUnit(ingredient)?.unitId, 100);

  const issue = getIssueUnitOptions(ingredient);
  assert.deepEqual(
    issue.map((o) => o.unitId),
    [100, 200, 300],
  );
  assert.equal(getDefaultIssueUnit(ingredient)?.unitId, 100);
});

test("stock UI keeps ledger quantity and WAC in the standard unit", () => {
  const display = resolveStockDisplayUnit(ingredient.units);
  assert.equal(display?.unit_id, 100);
  assert.equal(toStockDisplayQuantity(660, display), 660);
  assert.equal(toStockDisplayUnitCost(10, display), 10);

  const formatted = formatStockUnits(
    7920,
    ingredient.units,
    (n) => String(n),
  );
  assert.equal(formatted.big, null);
  assert.equal(formatted.base, "7920 ml");
});

test("active inventory runtime does not carry catalog unit roles", () => {
  const runtime = [
    "apps/web/lib/inventory/types.ts",
    "apps/web/lib/inventory/grn-create-data.ts",
    "apps/web/lib/inventory/stock-on-hand-data.ts",
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
    "apps/web/lib/inventory/transfer-create-data.ts",
    "apps/web/lib/inventory/branch-stock-issue-data.ts",
    "apps/web/app/(protected)/inventory/menu-recipes/page.tsx",
    "apps/web/app/(protected)/inventory/waste/new/page.tsx",
  ]
    .map(readRepo)
    .join("\n");

  assert.doesNotMatch(
    runtime,
    /receipt_unit_id|issue_unit_id|production_unit_id/,
  );
});

test("menu recipe and inventory documents accept any active ingredient unit", () => {
  const menuActions = readRepo(
    "apps/web/app/(protected)/inventory/menu-recipe-actions.ts",
  );
  assert.match(menuActions, /entryUnitRequired/);
  assert.match(menuActions, /entry_unit_id: line\.entryUnitId/);
  assert.match(
    menuActions,
    /\.from\("ingredient_units"\)[\s\S]*?\.eq\("is_active", true\)/,
  );

  const menuDialog = readRepo(
    "apps/web/app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
  );
  assert.doesNotMatch(menuDialog, /unitMode=/);
  assert.match(menuDialog, /unitEditable/);
  const lineEditor = readRepo(
    "apps/web/app/(protected)/inventory/_components/ingredient-lines-editor.tsx",
  );
  assert.match(lineEditor, /getIngredientUnitOptions\(ingredient\)/);

  const migration = readRepo(
    "supabase/migrations/20260803105716_active_ingredient_entry_units.sql",
  );
  assert.match(migration, /entry_unit_is_active_for_ingredient/);
  assert.match(migration, /jsonb_array_length\(p_units\) NOT BETWEEN 1 AND 20/);
  assert.match(migration, /demand_item\.entry_unit_id/);
});
