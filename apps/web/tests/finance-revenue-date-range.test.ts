import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Finance Revenue top items follows the selected date range", () => {
  const revenueLoader = read(
    "apps/web/app/(protected)/finance/revenue/_lib/revenue-loader.ts",
  );
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const actions = read("apps/web/app/(protected)/finance/actions.ts");

  for (const source of [revenueLoader, cockpit]) {
    assert.match(
      source,
      /fetchTopItems\(params\.branch,\s*resolved\.start,\s*resolved\.end\)/,
      "top items must use the resolved start/end window",
    );
    assert.doesNotMatch(
      source,
      /resolved\.start\.slice\(0,\s*7\)\s*\+\s*["']-01["']/,
      "top items must not collapse the selected range to the start month",
    );
  }

  assert.match(
    actions,
    /export async function fetchTopItems\(\s*branchId: number \| null,\s*startDate: string,\s*endDate: string,/,
    "fetchTopItems should expose an explicit date-range contract",
  );
  assert.match(actions, /p_start_date: parsedStart\.data/);
  assert.match(actions, /p_end_date: parsedEnd\.data/);
  assert.doesNotMatch(actions, /p_period_start/);
});

test("Finance top-items migration keeps compatibility and adds range RPC", () => {
  const migration = read(
    "supabase/migration-archive/20260609151615_finance_top_items_date_range.sql",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_top_items\(\s*p_branch_id BIGINT,\s*p_start_date DATE,\s*p_end_date DATE,/,
    "expected new range-bound top-items RPC",
  );
  assert.match(
    migration,
    /p\.paid_at >= v_start_utc[\s\S]*p\.paid_at < v_end_utc/,
    "expected top items to filter by the selected paid-at window",
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_top_items\(\s*p_branch_id BIGINT DEFAULT NULL,\s*p_period_start DATE DEFAULT NULL,/,
    "expected old month-bucket signature to remain as a wrapper",
  );
  assert.match(
    migration,
    /FROM public\.get_top_items\(\s*p_branch_id,\s*v_period_start,\s*v_period_end,\s*p_limit\s*\)/,
    "expected wrapper to delegate to the range RPC",
  );
});

test("Finance top-items decomposes side-items without double-counting revenue", () => {
  const migration = read(
    "supabase/migration-archive/20260609161402_finance_top_items_side_items.sql",
  );

  assert.match(
    migration,
    /CROSS JOIN LATERAL jsonb_array_elements\(pi\.sides\) AS side_el/,
    "expected side-items stored on order_items.sides to be expanded",
  );
  assert.match(
    migration,
    /\(side_el ->> 'side_item_id'\)::BIGINT AS menu_item_id/,
    "expected side-items to report as their own menu_item_id",
  );
  assert.match(
    migration,
    /SUM\(GREATEST\(pi\.line_revenue - COALESCE\(st\.side_revenue, 0\), 0\)\)/,
    "expected main item revenue to subtract side revenue",
  );
  assert.match(
    migration,
    /SUM\(parent_quantity \* quantity_per_parent\)/,
    "expected side quantity to multiply by the parent order item quantity",
  );
  assert.match(
    migration,
    /UNION ALL\s+SELECT branch_id, tenant_id, menu_item_id, item_name, quantity_sold, revenue\s+FROM side_components/,
    "expected top items to combine main and side component rows",
  );
});

test("Finance cockpit actual food cost follows the VN business-day window", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );

  assert.match(cockpit, /getVNDayUtcRange/);
  assert.match(cockpit, /getVNDateString/);
  assert.match(cockpit, /\.gte\("created_at",\s*startIso\)/);
  assert.match(cockpit, /\.lt\("created_at",\s*endIso\)/);
  assert.match(cockpit, /const period = getVNDateString\(row\.created_at\)/);
  assert.doesNotMatch(
    cockpit,
    /String\(row\.created_at \?\? ""\)\.slice\(0,\s*10\)/,
  );
  assert.doesNotMatch(cockpit, /function nextDate/);
});

test("Finance expenses actual food cost follows the VN business-day window", () => {
  const expenseActions = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );

  assert.match(expenseActions, /getVNDayUtcRange/);
  assert.match(expenseActions, /\.gte\("created_at",\s*startIso\)/);
  assert.match(expenseActions, /\.lt\("created_at",\s*endIso\)/);
  assert.doesNotMatch(expenseActions, /function nextDate/);
});

test("Finance operating expense excludes food-cost and transfer categories", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const categories = read(
    "apps/web/app/(protected)/finance/_lib/expense-categories.ts",
  );
  const expenseActions = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );
  const expensesClient = read(
    "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const dataContract = read("docs/ref/operational-data-contract.md");

  assert.match(categories, /cogs_manual: "materials"/);
  assert.match(categories, /bank_deposit: "transfer"/);
  assert.match(categories, /isOperatingExpenseCategory/);
  assert.match(cockpit, /select\("amount, category"\)/);
  assert.match(cockpit, /isOperatingExpenseCategory\(row\.category\)/);
  assert.match(expenseActions, /parsed\.data\.category === "cogs_manual"/);
  assert.match(expensesClient, /group !== "materials"/);
  assert.match(dataContract, /category thuộc nhóm `operating`/);
  assert.doesNotMatch(dataContract, /category='bank_deposit'/);
});

test("Finance revenue money-collected fields use payment amount", () => {
  const migration = read(
    "supabase/migration-archive/20260709050743_finance_revenue_payment_amount_contract.sql",
  );
  const revenueClient = read(
    "apps/web/app/(protected)/finance/revenue/revenue-client.tsx",
  );
  const dataContract = read("docs/ref/operational-data-contract.md");

  assert.match(
    migration,
    /p\.amount AS payment_amount/,
    "revenue migration should carry payment amount as the money-collected source",
  );
  assert.match(
    migration,
    /SUM\(pp\.payment_amount\)[\s\S]*AS net_revenue/,
    "KPI net_revenue should mean money collected from payments.amount",
  );
  assert.match(
    migration,
    /SUM\(pp\.payment_amount\) FILTER \(WHERE pp\.method = 'cash'\)/,
    "cash revenue should sum payment amount by payment method",
  );
  assert.match(
    migration,
    /COUNT\(\*\)::BIGINT AS order_count/,
    "order_count should be calculated from distinct order facts, not payment rows",
  );
  assert.match(
    migration,
    /SELECT DISTINCT ON \(pp\.tenant_id, pp\.branch_id, pp\.order_id\)/,
    "KPI order facts should deduplicate paid orders",
  );
  assert.match(
    migration,
    /SELECT DISTINCT ON \(pp\.paid_date, pp\.branch_id, pp\.tenant_id, pp\.order_id\)/,
    "daily and rollup order facts should deduplicate paid orders per paid date",
  );
  assert.doesNotMatch(
    migration,
    /SUM\(o\.total_amount\) FILTER \(WHERE p\.method/,
    "method breakdowns must not bucket order totals by payment method",
  );
  assert.match(revenueClient, /Sum of payments\.amount/);
  assert.match(dataContract, /Tổng `payments\.amount` theo `payments\.method`/);
  assert.match(dataContract, /`COUNT\(DISTINCT orders\.id\)`/);
});

test("Finance food-cost page shows actual cost coverage before estimate rows", () => {
  const page = read("apps/web/app/(protected)/finance/food-cost/page.tsx");
  const client = read(
    "apps/web/app/(protected)/finance/food-cost/food-cost-client.tsx",
  );
  const expenseActions = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );
  const financeMessages = read("apps/web/lib/messages/finance.ts");

  assert.match(page, /fetchActualFoodCostSummary/);
  assert.match(
    page,
    /fetchRevenueKpis\(params\.branch, resolved\.start, resolved\.end\)/,
  );
  assert.match(page, /actualFoodCost=\{actualSummary\.total\}/);
  assert.match(page, /coveredOrderCount=\{actualSummary\.orderCount\}/);
  assert.match(client, /label=\{foodCopy\.actualFoodCost\}/);
  assert.match(client, /foodCopy\.coverageValue/);
  assert.equal((client.match(/<KpiCard/g) ?? []).length, 2);
  assert.match(client, /title=\{foodCopy\.tableTitle\}[\s\S]*<DataTable/);
  assert.doesNotMatch(client, /const estimatedFoodCost = rows\.reduce/);
  assert.match(
    expenseActions,
    /select\("order_id, quantity_change, unit_cost"\)/,
  );
  assert.match(expenseActions, /orderIds\.add\(r\.order_id\)/);
  assert.match(financeMessages, /actualFoodCost: "Giá vốn đã ghi nhận"/);
});

test("Finance gates gross profit and operating result on data coverage", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const page = read("apps/web/app/(protected)/finance/page.tsx");
  const financeMessages = read("apps/web/lib/messages/finance.ts");

  assert.match(
    cockpit,
    /\.select\("branch_id, order_id, quantity_change, unit_cost, created_at"\)/,
    "actual food cost must keep order_id for coverage",
  );
  assert.match(cockpit, /const orderIds = new Set<number>\(\)/);
  assert.match(cockpit, /orderIds\.add\(row\.order_id\)/);
  assert.match(
    cockpit,
    /const costAvailable =\s*orderCount === 0 \|\| costCoverageOrderCount >= orderCount/,
    "gross profit must not be trusted when only a subset of paid orders has posted consumption",
  );
  assert.match(cockpit, /missingCostCoverageHint/);
  assert.match(page, /basic\.kpis\.grossProfit/);
  assert.match(page, /basic\.kpis\.operatingResult/);
  assert.doesNotMatch(page, /basic\.kpis\.moneyCollected/);
  assert.match(financeMessages, /netRevenue: "Doanh thu thuần"/);
});

test("Finance cockpit branch filter also scopes supplier payable risk", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );

  assert.match(cockpit, /branchId: number \| null/);
  assert.match(cockpit, /goods_received_notes!inner/);
  assert.match(cockpit, /credit_applied_amount/);
  assert.match(
    cockpit,
    /toNumber\(row\.total_amount\) -[\s\S]*toNumber\(row\.paid_amount\) -[\s\S]*toNumber\(row\.credit_applied_amount\)/,
  );
  assert.match(cockpit, /if \(outstanding <= 0\) return acc/);
  assert.match(
    cockpit,
    /query = query\.eq\("goods_received_notes\.branch_id", branchId\)/,
  );
  assert.match(
    cockpit,
    /fetchUnpaidSupplierInvoiceRisk\(\{[\s\S]*branchId: params\.branch,[\s\S]*\}\)/,
  );
});

test("Finance top-items side-item fanout avoids PL/pgSQL output-column ambiguity", () => {
  const migration = read(
    "supabase/migration-archive/20260701000214_fix_top_items_branch_ambiguity.sql",
  );

  assert.match(
    migration,
    /FROM side_lines sl[\s\S]*GROUP BY sl\.branch_id,\s*sl\.tenant_id,\s*sl\.menu_item_id/,
    "side_components must qualify branch/tenant/menu columns",
  );
  assert.match(
    migration,
    /mc\.branch_id[\s\S]*FROM main_components mc[\s\S]*sc\.branch_id[\s\S]*FROM side_components sc/,
    "component_rows must qualify both component sources",
  );
});

test("Finance live copy stays operating-first without two-mode labels", () => {
  const financeMessages = read("apps/web/lib/messages/finance.ts");
  const financeTypes = read(
    "apps/web/app/(protected)/finance/_lib/finance-types.ts",
  );

  assert.doesNotMatch(
    financeMessages,
    /layoutSimple|layoutAdvanced|simple:\s*"Đơn giản"|advanced:\s*"Chuyên sâu"|"Đơn giản"|"Chuyên sâu"|Kế toán nâng cao|hạch toán nâng cao/,
    "Finance copy must not expose stale simple/advanced layout or advanced-accounting wording",
  );
  assert.doesNotMatch(
    financeTypes,
    /FinanceLayoutMode|"simple"|"advanced"/,
    "Finance must not keep the retired simple/advanced layout mode type",
  );
  assert.match(
    financeMessages,
    /stageCompanyReporting: "Hỗ trợ kế toán để riêng"/,
    "support accounting should be framed as a separate helper area",
  );
  assert.match(
    financeMessages,
    /subLabel: "Vận hành"/,
    "default Finance workspace should stay operating-first (framed under Vận hành)",
  );
  assert.doesNotMatch(financeMessages, /Hệ thống tài khoản|Sổ nhật ký|B01-DN/);
  assert.match(financeMessages, /Thuế tạm tính/);
  assert.doesNotMatch(
    financeMessages,
    /khách không lấy hóa đơn|khách hàng không lấy hóa đơn|khách lẻ không yêu cầu MST|trước VAT|VAT đầu ra/,
    "Finance live copy should keep operating labels terse and current",
  );
});
