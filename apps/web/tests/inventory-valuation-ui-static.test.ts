import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const readWeb = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const readRoot = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8");

test("supplier invoice confirmation exposes valuation settlement", () => {
  const actions = readWeb(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const detailSheet = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-detail-sheet.tsx",
  );

  assert.match(actions, /get_supplier_invoice_valuation_summary/);
  assert.match(actions, /SupplierInvoiceValuationSummary/);
  assert.match(
    actions,
    /provisionalValue: z\.coerce\.number\(\)\.default\(0\)/,
  );
  assert.match(actions, /warning: z\.boolean\(\)\.default\(false\)/);
  assert.match(detailSheet, /productionInventoryAdjustment/);
  assert.match(detailSheet, /foodCostVariance/);
  assert.match(detailSheet, /wasteVariance/);
  assert.match(detailSheet, /valuationSummary\.warning/);
});

test("inventory valuation has no period-close management surface", () => {
  const financeNav = readWeb(
    "app/(protected)/finance/components/finance-nav.ts",
  );
  const surfaceNav = readWeb("app/lib/control-surface-nav.ts");
  const archetypes = readRoot("scripts/page-archetypes.mjs");

  assert.equal(
    existsSync(
      resolve(
        import.meta.dirname,
        "..",
        "app/(protected)/finance/cost-close",
      ),
    ),
    false,
  );
  assert.doesNotMatch(financeNav, /cost-close|showCostClose|LockKeyhole/);
  assert.doesNotMatch(surfaceNav, /showCostClose/);
  assert.doesNotMatch(archetypes, /finance\/cost-close/);
});

test("finance valuation surfaces do not fall back to mutable reference cost", () => {
  const cockpit = readWeb("app/(protected)/finance/_lib/finance-cockpit.ts");
  const foodCost = readWeb("app/_lib/food-cost-actions.ts");
  const actualFoodCost = readWeb("app/(protected)/finance/expense-actions.ts");
  const foodCostMigration = readRoot(
    "supabase/migrations/20260820151656_finance_food_cost_recorded.sql",
  );

  assert.match(cockpit, /costReadable: cockpit\.foodCost\.valuationActive/);
  assert.doesNotMatch(cockpit, /movement_subtype", "sale_consumption"/);
  assert.doesNotMatch(cockpit, /ingredient\?\.unit_cost/);
  assert.equal(
    foodCost.includes("fallbackUnitCost: Number(ingredient?.unit_cost"),
    false,
  );
  assert.match(actualFoodCost, /get_finance_food_cost_recorded/);
  assert.match(actualFoodCost, /valuationActive/);
  assert.match(
    actualFoodCost,
    /Giá vốn món yêu cầu sổ định giá kho đang hoạt động/,
  );
  assert.doesNotMatch(actualFoodCost, /\.from\("inventory_valuation_events"\)/);
  assert.match(foodCostMigration, /cutover\.status = 'active'/);
  assert.doesNotMatch(
    actualFoodCost,
    /movement_subtype", "sale_consumption"/,
  );
  assert.doesNotMatch(actualFoodCost, /foodCostSource/);
});

test("valuation warning kinds have durable notification copy and icon mapping", () => {
  const copy = readWeb("lib/messages/notifications.ts");
  const item = readWeb("app/_components/notification-item.tsx");

  for (const kind of [
    "inventory.valuation_variance",
    "inventory.valuation_reconciliation_failed",
  ]) {
    assert.match(copy, new RegExp(kind.replaceAll(".", "\\.")));
    assert.match(item, new RegExp(kind.replaceAll(".", "\\.")));
  }
});
