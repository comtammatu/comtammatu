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
  const client = readWeb(
    "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  );

  assert.match(actions, /get_supplier_invoice_valuation_summary/);
  assert.match(actions, /SupplierInvoiceValuationSummary/);
  assert.match(
    actions,
    /provisionalValue: z\.coerce\.number\(\)\.default\(0\)/,
  );
  assert.match(actions, /warning: z\.boolean\(\)\.default\(false\)/);
  assert.match(client, /productionInventoryAdjustment/);
  assert.match(client, /foodCostVariance/);
  assert.match(client, /wasteVariance/);
  assert.match(client, /valuation\?\.warning/);
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

  // The cockpit's actual-food-cost snapshot drives the valuation vs legacy
  // branch via isInventoryValuationActive (status === "active"). The orphaned
  // inventory-cash-tied fetch that also read inventory_valuation_accounts /
  // stock_levels was dropped (it fed a field no landing screen consumed).
  assert.match(cockpit, /data\?\.status === "active"/);
  assert.doesNotMatch(cockpit, /ingredient\?\.unit_cost/);
  assert.equal(
    foodCost.includes("fallbackUnitCost: Number(ingredient?.unit_cost"),
    false,
  );
  assert.match(actualFoodCost, /\.from\("inventory_valuation_events"\)/);
  assert.match(actualFoodCost, /allocation_bucket", "food_cost"/);
  assert.match(actualFoodCost, /cutover\?\.status !== "active"/);
  assert.match(actualFoodCost, /\.from\("stock_movements"\)/);
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
