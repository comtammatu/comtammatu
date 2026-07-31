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

const threeRoleIngredient = {
  receipt_unit_id: 300,
  issue_unit_id: 200,
  production_unit_id: 100,
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

test("GRN picker is receipt+issue; issue picker is issue+receipt; neither includes production-only", () => {
  const purchase = getPurchaseUnitOptions(threeRoleIngredient);
  assert.deepEqual(
    purchase.map((o) => o.unitId),
    [300, 200],
  );
  assert.equal(getDefaultPurchaseUnit(threeRoleIngredient)?.unitId, 300);

  const issue = getIssueUnitOptions(threeRoleIngredient);
  assert.deepEqual(
    issue.map((o) => o.unitId),
    [200, 300],
  );
  assert.equal(getDefaultIssueUnit(threeRoleIngredient)?.unitId, 200);
});

test("stock UI converts ledger qty/WAC into issue units for display", () => {
  const display = resolveStockDisplayUnit(
    threeRoleIngredient.units,
    threeRoleIngredient.issue_unit_id,
  );
  assert.equal(display?.unit_id, 200);
  assert.equal(toStockDisplayQuantity(660, display), 2);
  assert.equal(toStockDisplayUnitCost(10, display), 3300);

  const formatted = formatStockUnits(
    7920,
    threeRoleIngredient.units,
    (n) => String(n),
    { preferredUnitId: 200 },
  );
  assert.equal(formatted.big, "1 thung");
  assert.equal(formatted.base, "24 chai");
});

test("menu recipe save accepts any active ladder unit and stock migration allows receipt|issue", () => {
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
  assert.match(menuDialog, /unitMode="all"/);
  assert.match(menuDialog, /unitEditable/);

  const migration = readRepo(
    "supabase/migrations/20260801001600_inventory_entry_unit_receipt_or_issue.sql",
  );
  assert.match(migration, /entry_unit_matches_roles/);
  assert.match(migration, /enforce_inventory_unit_roles\('receipt,issue'\)/);
  assert.match(migration, /enforce_inventory_unit_roles\('issue,receipt'\)/);
});
