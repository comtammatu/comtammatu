import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("inventory monetary reads fail closed at the current runtime boundary", () => {
  const fixture = read("apps/web/tests/fixtures/supabase-e2e/tenant.sql");
  const boundary = read("apps/web/lib/inventory/monetary-access.ts");
  const ingredientActions = read(
    "apps/web/app/(protected)/inventory/ingredient-actions.ts",
  );
  const stockData = read("apps/web/lib/inventory/stock-on-hand-data.ts");
  const stockDetailData = read(
    "apps/web/lib/inventory/stock-on-hand-detail-data.ts",
  );
  const financeCockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const financePage = read("apps/web/app/(protected)/finance/page.tsx");

  const accountantTemplate =
    fixture.match(/\('accountant', 'accountant', ARRAY\[[^\]]*\]\)/)?.[0] ??
    "";
  const ownerTemplate =
    fixture.match(/\('owner', 'owner', ARRAY\[[^\]]*\]\)/)?.[0] ?? "";
  assert.match(accountantTemplate, /procurement:price_list_read/);
  assert.doesNotMatch(accountantTemplate, /inventory:valuation_read/);
  assert.match(ownerTemplate, /inventory:valuation_read/);
  assert.match(boundary, /role !== "owner" && role !== "accountant"/);
  assert.match(boundary, /client: null/);

  assert.match(ingredientActions, /getAuthContext\(PROCUREMENT_ROLES\)/);
  assert.match(
    stockData,
    /fetchStockBearingLocationIds\(\{\s*supabase: stockReadClient,/,
  );
  assert.match(
    stockDetailData,
    /fetchStockBearingLocationIds\(\{\s*supabase: readClient,/,
  );
  assert.match(
    financeCockpit,
    /canReadRequestedValuation\s+\?\s+fetchInventoryValueByBranch\(\)/,
  );
  assert.match(
    financeCockpit,
    /canViewInventoryValuation: canReadRequestedValuation/,
  );
  assert.match(financePage, /cockpit\.canViewInventoryValuation \?/);
});
