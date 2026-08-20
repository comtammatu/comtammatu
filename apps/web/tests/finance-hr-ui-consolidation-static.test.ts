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
  const expenseKpis = read(
    "apps/web/app/(protected)/finance/expenses/expense-list-kpis.tsx",
  );
  const bank = read(
    "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx",
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

  assert.match(expenses, /<AppListFrame[\s\S]*title=\{listTitle\}/);
  assert.match(expenses, /<FilterBar[\s\S]{0,120}variant="inline"/);
  assert.match(expenses, /<DataTable/);
  assert.equal((expenseKpis.match(/<KpiCard/g) ?? []).length, 3);
  assert.match(expenseKpis, /label=\{copy\.monthLabel\}/);
  assert.match(expenseKpis, /label=\{copy\.startupLabel\}/);
  assert.match(expenses, /copy\.needsActionFilter/);
  assert.match(expenses, /expensePaymentMethod\(row\)/);

  assert.match(bank, /<AppListFrame[\s\S]*title=\{copy\.listTitle\}/);
  assert.match(bank, /<FilterBar[\s\S]{0,120}variant="inline"/);
  assert.match(bank, /contentScroll/);
  assert.match(bank, /<DataTable/);
  assert.match(bank, /<ItemHeader>/);
  assert.doesNotMatch(bank, /<KpiRow|<KpiCard/);
  assert.doesNotMatch(bank, /variant=\{openQueueCount > 0 \? "warning"/);

  assert.equal((foodCost.match(/<KpiCard/g) ?? []).length, 2);
  assert.match(foodCost, /label=\{foodCopy\.actualFoodCost\}/);
  assert.match(foodCost, /label=\{foodCopy\.grossMargin\}/);
  assert.doesNotMatch(foodCost, /foodCopy\.coverage/);
  assert.doesNotMatch(foodCost, /foodCopy\.operatingConsumption/);
  assert.doesNotMatch(foodCost, /hint=\{foodCopy\./);
  assert.match(foodCost, /title=\{foodCopy\.tableTitle\}/);
  assert.match(foodCost, /foodCopy\.tableTotal/);
  assert.match(foodCost, /FinanceAmountCell/);
  assert.match(foodCost, /foodCopy\.revenueCurrency/);
  assert.match(foodCost, /foodCopy\.unitFoodCostCurrency/);
  assert.match(foodCost, /foodCopy\.unitCostPerPortion/);
  assert.match(foodCost, /foodCopy\.foodCostCurrency/);
  assert.match(foodCost, /function RecipeCostCell/);
  assert.doesNotMatch(foodCost, /key: "unit_food_cost"/);
  assert.match(foodCost, /foodCopy\.grossMargin/);
  assert.doesNotMatch(foodCost, /foodCopy\.unitSellingPriceCurrency/);
  assert.match(foodCost, /foodCopy\.grossProfitCurrency/);
  assert.match(foodCost, /function MarginCell/);
  assert.match(foodCost, /unit_ingredient_cost/);
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

test("Finance landing does not surface VAT cards on the operating hub", () => {
  const page = read("apps/web/app/(protected)/finance/page.tsx");
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );

  assert.doesNotMatch(page, /cockpit\.vat\.inputRecorded/);
  assert.doesNotMatch(page, /cockpit\.vat\.outputIssued/);
  assert.doesNotMatch(page, /basic\.sections\.vat/);
  assert.match(cockpit, /vat: \{ inputRecorded: null, outputIssued: null \}/);
  assert.match(cockpit, /\.from\("expenses"\)/);
  assert.doesNotMatch(cockpit, /\.from\("supplier_invoices"\)/);
  assert.doesNotMatch(cockpit, /\.from\("tax_invoices"\)/);
});

test("HR long screens preserve hierarchy and LIST viewport width", () => {
  const attendance = read("apps/web/app/(protected)/hr/attendance/page.tsx");
  const setup = read("apps/web/app/(protected)/hr/setup/setup-client.tsx");
  const hrClient = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const staff = read("apps/web/app/(protected)/hr/staff/page.tsx");
  const audit = read("apps/web/app/(protected)/hr/staff/audit/page.tsx");
  const permissions = read(
    "apps/web/app/(protected)/hr/staff/[id]/permissions/page.tsx",
  );
  const nav = read("apps/web/app/lib/control-surface-nav.ts");

  assert.match(attendance, /<AppPageTabs/);
  assert.match(attendance, /<TabsContent value="today">/);
  assert.match(attendance, /<TabsContent value="approvals">/);
  assert.match(attendance, /<TabsContent value="timesheet">/);
  assert.match(attendance, /<TabsContent value="roster">/);
  assert.match(attendance, /embedded/);
  assert.match(setup, /<AppPageTabs/);
  assert.match(setup, /value: "leave"/);
  assert.match(setup, /value: "shifts"/);
  assert.match(setup, /value: "tasks"/);
  assert.doesNotMatch(setup, /templatesPlaceholder/);
  assert.doesNotMatch(setup, /rosterPlaceholder/);
  assert.match(hrClient, /paramKey="view"/);
  assert.match(hrClient, /value: "profile"/);
  assert.match(hrClient, /value: "accounts"/);
  assert.match(staff, /redirect\(`\/hr\?\$\{next\.toString\(\)\}`\)/);
  assert.match(audit, /getStaffPermissionLabelVi/);
  assert.match(audit, /\/hr\?view=accounts/);
  assert.match(audit, /<AppPage width="xwide" density="compact">/);
  assert.doesNotMatch(permissions, /tabs=\{/);
  assert.ok(
    permissions.indexOf("<AppPageHeader") <
      permissions.indexOf("<RoleBindingsClient"),
  );
  assert.doesNotMatch(nav, /staffAuditLabel/);
  assert.doesNotMatch(nav, /MODULE_ACL\.staff\.path/);
});
