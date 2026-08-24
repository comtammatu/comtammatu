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
  const actions = read("apps/web/app/(protected)/finance/actions.ts");

  // Top items live on the Revenue page via loadRevenueBundle. The finance
  // landing cockpit no longer fetches top items (the field was orphaned and
  // dropped), so only the revenue loader is checked here.
  for (const source of [revenueLoader]) {
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
  const foodCostMigration = read(
    "supabase/migrations/20260820151656_finance_food_cost_recorded.sql",
  );

  assert.match(cockpit, /get_finance_operating_cockpit/);
  assert.match(foodCostMigration, /Asia\/Ho_Chi_Minh/);
  assert.match(foodCostMigration, /effective_at >= v_start_utc/);
  assert.match(foodCostMigration, /effective_at < v_end_utc/);
  assert.doesNotMatch(cockpit, /getVNDayUtcRange/);
  assert.doesNotMatch(cockpit, /fetchAllPagedRows/);
});

test("Finance expenses actual food cost follows the VN business-day window", () => {
  const expenseActions = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );
  const foodCostMigration = read(
    "supabase/migrations/20260820151656_finance_food_cost_recorded.sql",
  );

  assert.match(expenseActions, /get_finance_food_cost_recorded/);
  assert.match(foodCostMigration, /Asia\/Ho_Chi_Minh/);
  assert.match(foodCostMigration, /effective_at >= v_start_utc/);
  assert.match(foodCostMigration, /effective_at < v_end_utc/);
  assert.doesNotMatch(expenseActions, /getVNDayUtcRange/);
  assert.doesNotMatch(expenseActions, /fetchAllPagedRows/);
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
  const expenseFormSchema = read(
    "apps/web/app/(protected)/finance/expenses/expense-form-schema.ts",
  );
  const expensesClient = read(
    "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
  );
  const dataContract = read("docs/ref/operational-data-contract.md");
  const expenseSummaryMigration = read(
    "supabase/migrations/20260818171912_finance_expense_period_summary.sql",
  );
  const operatingCockpitMigration = read(
    "supabase/migrations/20260820151657_finance_operating_cockpit_and_stop_mv_food_cost.sql",
  );
  const startupCapitalMigration = read(
    "supabase/migrations/20260824013553_finance_startup_capital_summary_rpc.sql",
  );

  assert.match(categories, /cogs_manual: "materials"/);
  assert.match(categories, /bank_deposit: "transfer"/);
  assert.match(categories, /capital: "startup"/);
  assert.match(categories, /deposit: "startup"/);
  assert.match(categories, /isOperatingExpenseCategory/);
  assert.match(categories, /isStartupCapitalCategory/);
  assert.match(cockpit, /get_finance_operating_cockpit/);
  // Startup-capital classification truth moved server-side: the cockpit
  // calls the summary RPC and the RPC keeps the capital+deposit slice.
  assert.match(cockpit, /get_finance_startup_capital_summary/);
  assert.match(startupCapitalMigration, /category IN \('capital', 'deposit'\)/);
  assert.match(operatingCockpitMigration, /get_finance_expense_period_summary/);
  assert.doesNotMatch(expenseSummaryMigration, /cogs_manual/);
  assert.doesNotMatch(expenseSummaryMigration, /bank_deposit/);
  assert.doesNotMatch(
    cockpit.slice(
      cockpit.indexOf("async function fetchStartupCapitalSummary"),
      cockpit.indexOf("async function fetchOperatingCockpitRpc"),
    ),
    /expense_date/,
  );
  assert.doesNotMatch(
    cockpit,
    /branch_id\.eq\.\$\{branchId\},branch_id\.is\.null/,
  );
  assert.match(expenseActions, /parsed\.data\.category === "cogs_manual"/);
  assert.match(expenseFormSchema, /EXPENSE_CATEGORIES_BY_GROUP\.operating/);
  assert.match(expenseFormSchema, /EXPENSE_CATEGORIES_BY_GROUP\.startup/);
  assert.match(expensesClient, /categoryLabel\(row\.category\)/);
  assert.match(dataContract, /expenses\.subtotal` nhóm operating/);
  assert.match(dataContract, /finance\.expense\.startup_capital/);
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
  assert.match(
    dataContract,
    /finance\.revenue\.money_collected[\s\S]*`payments\.amount` completed/,
  );
  assert.match(dataContract, /get_revenue_kpis[\s\S]*payments \+ orders/);
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
  assert.match(page, /fetchRevenueKpis/);
  assert.match(page, /calculateGrossProfitIdentity/);
  assert.match(page, /actualFoodCost=\{actualSummary\.total\}/);
  assert.match(page, /grossMarginPct=\{grossMarginPct\}/);
  assert.doesNotMatch(page, /operatingConsumption=\{actualSummary\.operatingConsumption\}/);
  assert.doesNotMatch(page, /coveredOrderCount=/);
  assert.match(client, /label=\{foodCopy\.actualFoodCost\}/);
  assert.match(client, /label=\{foodCopy\.grossMargin\}/);
  assert.doesNotMatch(client, /label=\{foodCopy\.operatingConsumption\}/);
  assert.doesNotMatch(client, /foodCopy\.coverage/);
  assert.doesNotMatch(client, /hint=\{foodCopy\./);
  assert.doesNotMatch(client, /foodCopy\.unitSellingPriceCurrency/);
  assert.equal((client.match(/<KpiCard/g) ?? []).length, 2);
  assert.match(client, /title=\{foodCopy\.tableTitle\}[\s\S]*<DataTable/);
  assert.doesNotMatch(client, /const estimatedFoodCost = rows\.reduce/);
  assert.match(expenseActions, /get_finance_food_cost_recorded/);
  assert.match(expenseActions, /operatingConsumption/);
  assert.match(expenseActions, /coverageComplete/);
  assert.match(expenseActions, /valuationActive/);
  assert.doesNotMatch(expenseActions, /\.from\("inventory_valuation_events"\)/);
  assert.match(financeMessages, /actualFoodCost: "Giá vốn thực tế"/);
  assert.match(financeMessages, /tableTitle: "Theo món"/);
  assert.match(financeMessages, /tableTotal: "Tổng"/);
  assert.doesNotMatch(financeMessages, /\bbucket\b/i);
  assert.doesNotMatch(
    financeMessages,
    /Tiêu hao bán gắn đơn đã thanh toán · khác định mức/,
  );
  assert.match(
    financeMessages,
    /netRevenueHint:\s*"Giá món trừ giảm giá\. Chưa gồm thuế GTGT\."/,
  );
  assert.match(
    financeMessages,
    /expenseDescription:\s*"Chi phí đã ghi trong kỳ\. Không gồm giá vốn món\."/,
  );
  assert.match(
    financeMessages,
    /description:\s*"Hóa đơn NCC, công nợ và thuế GTGT\."/,
  );
  assert.match(
    financeMessages,
    /description:\s*"Sao kê SePay\. Khớp với chứng từ thanh toán và chi\."/,
  );
  assert.doesNotMatch(financeMessages, /Marketing \/ khuyến mãi/);
});

test("Product UI copy bans recurring EN loanwords in Hint/Description dictionaries", () => {
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");
  const notificationsMessages = read("apps/web/lib/messages/notifications.ts");
  const settingsMessages = read("apps/web/lib/messages/settings.ts");
  const controlSurfaceMessages = read(
    "apps/web/lib/messages/control-surface.ts",
  );
  const operatorMessages = read("apps/web/lib/messages/operator.ts");
  const hrForm = read(
    "apps/web/app/(protected)/hr/employee-form-dialog.tsx",
  );

  assert.match(
    inventoryMessages,
    /stockJobConsumption:\s*"Xem sổ tiêu hao và phiếu ghi tay cần kiểm tra\."/,
  );
  assert.doesNotMatch(inventoryMessages, /\bledger\b/i);
  assert.doesNotMatch(inventoryMessages, /\bmô-đun\b/i);
  assert.match(
    notificationsMessages,
    /pageDescription:\s*"Việc còn mở: duyệt, bàn giao kho và cảnh báo vận hành"/,
  );
  assert.doesNotMatch(notificationsMessages, /\bhandoff\b/i);
  assert.doesNotMatch(settingsMessages, /\bhandoff\b/i);
  assert.match(controlSurfaceMessages, /attentionTitle:\s*"Cần xử lý"/);
  assert.doesNotMatch(controlSurfaceMessages, /\bmô-đun\b/i);
  assert.match(
    operatorMessages,
    /pickupDescription:\s*"Gọi số cho khách và người giao hàng"/,
  );
  assert.doesNotMatch(operatorMessages, /\bshipper\b/i);
  assert.match(hrForm, /khi tạo kỳ lương/);
  assert.doesNotMatch(hrForm, /\bpayroll\b/i);
});

test("Finance keeps POS food-cost coverage diagnostic and period result on goods-in", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const page = read("apps/web/app/(protected)/finance/page.tsx");
  const financeMessages = read("apps/web/lib/messages/finance.ts");
  const goodsIn = read(
    "apps/web/app/(protected)/finance/_lib/finance-goods-in.ts",
  );
  const result = read(
    "apps/web/app/(protected)/finance/_lib/finance-result.ts",
  );
  const expenseActions = read(
    "apps/web/app/(protected)/finance/expense-actions.ts",
  );

  assert.match(cockpit, /get_finance_operating_cockpit/);
  assert.match(cockpit, /parseFinanceOperatingCockpitRpc/);
  assert.match(expenseActions, /get_finance_food_cost_recorded/);
  assert.match(
    cockpit,
    /const costAvailable =\s*orderCount === 0 \|\| costCoverageOrderCount >= orderCount/,
    "coverage still drives UI tone when only a subset of paid orders has posted consumption",
  );
  assert.match(cockpit, /missingCostCoverageHint/);
  assert.match(cockpit, /costReadable: cockpit\.foodCost\.valuationActive/);
  assert.doesNotMatch(cockpit, /fetchFoodCost\(/);
  assert.doesNotMatch(cockpit, /fetchActualFoodCostSnapshot/);
  assert.doesNotMatch(cockpit, /fetchPeriodGoodsIn/);
  assert.match(goodsIn, /kind === "inbound_transfer"/);
  assert.match(goodsIn, /eventType !== "transfer_in"/);
  assert.match(goodsIn, /isConfirmedSupplierInvoiceGoodsIn/);
  assert.match(goodsIn, /CONFIRMED_SUPPLIER_INVOICE_STATUSES/);
  assert.match(
    result,
    /netRevenueBeforeVat - goodsIn - operatingExpense \+ inventoryChange/,
  );
  assert.doesNotMatch(result, /grossProfit - operatingExpense/);
  assert.match(page, /renderGrossProfitCard/);
  assert.match(page, /basic\.sections\.grossProfit/);
  assert.match(page, /basic\.kpis\.periodCost/);
  assert.match(page, /basic\.kpis\.inboundTransfer/);
  assert.match(page, /basic\.kpis\.operatingResult/);
  assert.doesNotMatch(page, /basic\.kpis\.moneyCollected/);
  assert.match(financeMessages, /netRevenue: "Doanh thu thuần"/);
  assert.match(financeMessages, /inboundTransfer: "Chi phí hàng"/);
  assert.match(financeMessages, /inventoryPurchases: "Chi mua hàng"/);
  assert.doesNotMatch(
    financeMessages,
    /operatingResultHint:[\s\S]*Lợi nhuận gộp trừ chi vận hành/,
  );
});

test("Finance cockpit branch filter also scopes supplier payable risk", () => {
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );
  const migration = read(
    "supabase/migrations/20260820151657_finance_operating_cockpit_and_stop_mv_food_cost.sql",
  );

  assert.match(cockpit, /branchId: number \| null/);
  assert.match(cockpit, /get_finance_operating_cockpit/);
  assert.match(migration, /unpaid_ap_count/);
  assert.match(migration, /unpaid_ap_amount/);
  assert.match(
    migration,
    /goods_received_notes|supplier_invoices/,
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
    /khách không lấy hóa đơn|khách hàng không lấy hóa đơn|khách lẻ không yêu cầu MST|trước VAT/,
    "Finance live copy should keep operating labels terse and current",
  );
});

test("Finance landing wires period-integrity hints, inventory-change gating and readiness", () => {
  const page = read("apps/web/app/(protected)/finance/page.tsx");
  const cockpit = read(
    "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts",
  );

  // (a) The operating-result card carries the inventory-aware hint so the
  // previously dead copy is wired in (dead-copy fix).
  assert.match(
    page,
    /function renderOperatingResultCard\(\)[\s\S]*?operatingResultHint[\s\S]*?operatingResultHintWithoutInventory/,
    "operating-result card must pass the hint/without-inventory hint pair",
  );

  // (b) Inventory-change visibility gates on the server flags, not on
  // includesBranchData, so company scope can show the summed term when
  // included + readable.
  assert.match(
    cockpit,
    /canReadRequestedValuation &&\s*\(cockpit\?\.inventoryReadable \?\? false\) &&\s*\(cockpit\?\.inventoryChangeIncluded \?\? false\)/,
    "canViewInventoryValuation must gate on inventoryReadable + inventoryChangeIncluded",
  );
  assert.doesNotMatch(
    cockpit,
    /canReadRequestedValuation &&\s*includesBranchData &&\s*\(cockpit\?\.inventoryReadable \?\? false\)/,
    "old three-term inventory-change gate must be gone",
  );
  assert.doesNotMatch(cockpit, /includesBranchData/);

  // (c) Readiness RPC is wired in and can only fire for the sealed
  // last_month range.
  assert.match(cockpit, /get_finance_period_close_readiness/);
  assert.match(
    cockpit,
    /params\.range === "last_month"/,
    "readiness fetch must be gated on the last_month preset",
  );

  // (d) Total asset value never folds startup capital into the sum
  // (textual guard kept stable around the addMoney block).
  const assetBlock = page.slice(
    page.indexOf("const totalAssetValue = addMoney"),
    page.indexOf("const totalAssetValueDetails"),
  );
  assert.ok(assetBlock.length > 0, "totalAssetValue block must be found");
  assert.doesNotMatch(
    assetBlock,
    /startupCapital/,
    "totalAssetValue must not reference startup capital",
  );
});
