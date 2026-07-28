import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Finance retires the duplicate inventory workspace and keeps one value card", () => {
  const page = read("apps/web/app/(protected)/finance/page.tsx");
  const nav = read(
    "apps/web/app/(protected)/finance/components/finance-nav.ts",
  );
  const route = resolve(
    repoRoot,
    "apps/web/app/(protected)/finance/inventory-value/page.tsx",
  );

  assert.equal(existsSync(route), false);
  assert.doesNotMatch(nav, /\/finance\/inventory-value/);
  assert.match(
    page,
    /label=\{financeCopy\.basic\.kpis\.inventoryClosingValue\}/,
  );
  assert.doesNotMatch(page, /href=.*\/finance\/inventory-value/);
});

test("Finance analysis routes use compact Design System composition", () => {
  const expenses = read(
    "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const foodCost = read(
    "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx",
  );
  const revenue = read(
    "apps/web/app/(protected)/finance/revenue/revenue-client.tsx",
  );
  const charts = read(
    "apps/web/app/(protected)/finance/revenue/revenue-charts-internal.tsx",
  );
  const workQueue = read(
    "apps/web/app/(protected)/finance/components/work-queue-strip.tsx",
  );

  assert.match(expenses, /<AppSection[\s\S]*title=\{copy\.listTitle\}/);
  assert.match(expenses, /<DataTable/);
  assert.match(expenses, /<KpiRow density="compact">/);
  // Period total + the actionable "cần xử lý" counterpart. Nothing else on a
  // LIST route earns KPI real estate.
  assert.equal((expenses.match(/<KpiCard/g) ?? []).length, 2);
  assert.match(expenses, /label=\{copy\.needsActionLabel\}/);
  assert.match(expenses, /expensePaymentMethod\(row\)/);

  assert.equal((foodCost.match(/<KpiCard/g) ?? []).length, 2);
  assert.match(foodCost, /title=\{foodCopy\.tableTitle\}/);
  assert.match(foodCost, /foodCopy\.revenueCurrency/);
  assert.match(foodCost, /<DataTable/);

  assert.match(revenue, /<AppPageTabs/);
  for (const value of ["overview", "analysis", "control"]) {
    assert.match(revenue, new RegExp(`<TabsContent value="${value}"`));
  }
  assert.match(
    revenue,
    /<KpiRow density="compact" className="lg:grid-cols-4">/,
  );
  assert.doesNotMatch(charts, /<PieChart|<BarChart/);
  assert.match(charts, /<LineChart/);
  assert.match(
    workQueue,
    /<KpiRow density="compact" className="lg:grid-cols-4">/,
  );
  assert.equal((workQueue.match(/<KpiCard/g) ?? []).length, 4);
  assert.doesNotMatch(workQueue, /rounded-md border p-3/);
});

test("HR long screens preserve hierarchy and LIST viewport width", () => {
  const attendance = read("apps/web/app/(protected)/hr/attendance/page.tsx");
  const setup = read("apps/web/app/(protected)/hr/setup/setup-client.tsx");
  const staff = read("apps/web/app/(protected)/hr/staff/page.tsx");
  const audit = read("apps/web/app/(protected)/hr/staff/audit/page.tsx");
  const permissions = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/page.tsx",
  );

  assert.match(attendance, /<AppPageTabs/);
  assert.match(attendance, /<TabsContent value="attendance">/);
  assert.match(attendance, /<TabsContent value="leave">/);
  assert.doesNotMatch(setup, /<div className="flex flex-col gap-4">/);
  assert.match(staff, /<AppPage width="xwide">/);
  assert.match(audit, /<AppPage width="xwide">/);
  assert.doesNotMatch(permissions, /tabs=\{/);
  assert.ok(
    permissions.indexOf("<AppPageHeader") < permissions.indexOf("<AppPageTabs"),
  );
});
