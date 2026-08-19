import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const ADMIN_COPY = "apps/web/lib/messages/control-surface.ts";
const FINANCE_PAGE = "apps/web/app/(protected)/finance/page.tsx";
const FINANCE_COCKPIT =
  "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts";
const FINANCE_COPY = "apps/web/lib/messages/finance.ts";
const FINANCE_SUBROUTE_SURFACES = [
  "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  "apps/web/app/(protected)/finance/equipment/page.tsx",
  "apps/web/app/(protected)/finance/expenses/page.tsx",
  "apps/web/app/(protected)/finance/food-cost/page.tsx",
  "apps/web/app/(protected)/finance/invoices/page.tsx",
  "apps/web/app/(protected)/finance/revenue/revenue-client.tsx",
  "apps/web/app/(protected)/finance/revenue/[date]/page.tsx",
  "apps/web/app/(protected)/finance/supplier-invoices/page.tsx",
] as const;
const FINANCE_REVENUE =
  "apps/web/app/(protected)/finance/revenue/revenue-client.tsx";
const FINANCE_REVENUE_DRILL =
  "apps/web/app/(protected)/finance/revenue/[date]/revenue-drill-tabs.tsx";
const FINANCE_BANK_TABLE =
  "apps/web/app/(protected)/finance/bank-transactions/bank-transactions-table.tsx";
const INVENTORY_COPY = "apps/web/lib/messages/inventory.ts";
const PRINT_JOBS_PAGE =
  "apps/web/app/(protected)/settings/printers/jobs/page.tsx";
const PRINT_JOBS_CLIENT =
  "apps/web/app/(protected)/settings/printers/jobs/print-jobs-client.tsx";
const BRANCH_PAGE =
  "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx";
const BRANCH_COMMAND_CONFIG =
  "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_lib/command-config.tsx";
const BRANCH_DATA =
  "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/data.ts";
const TODAY_WORK_STATE = "apps/web/lib/staff-runtime/_lib/today-work-state.ts";
const ATTENDANCE_POLICY_MIGRATION =
  "supabase/migration-archive/20260719070350_align_attendance_checkout_read_policy.sql";
const BACKTICK = "`";

function literalWith(pattern: string, flags = "i"): RegExp {
  return new RegExp(
    `"[^"\\n]*(?:${pattern})[^"\\n]*"|${BACKTICK}[^${BACKTICK}\\n]*(?:${pattern})[^${BACKTICK}\\n]*${BACKTICK}`,
    flags,
  );
}

test("finance overview presents period results, current funds, and inventory in order", () => {
  const page = read(FINANCE_PAGE);
  const pageBody = page.slice(
    page.indexOf("export default async function FinancePage"),
  );
  const cockpit = read(FINANCE_COCKPIT);
  const copy = read(FINANCE_COPY);

  assert.match(page, /xl:grid-cols-\[minmax\(0,1fr\)_auto/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.netRevenue\}/);
  assert.match(page, /kpis\.periodCost/);
  assert.match(page, /kpis\.inboundTransfer/);
  assert.match(page, /kpis\.inventoryPurchases/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.ingredientCost\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.grossProfit\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.operatingExpense\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.startupCapital\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.inventoryChange\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.operatingResult\}/);
  assert.match(
    page,
    /label=\{financeCopy\.basic\.kpis\.inventoryClosingValue\}/,
  );
  assert.match(page, /cockpit\.kpis\.netRevenueBeforeVat/);
  assert.doesNotMatch(page, /cockpit\.kpis\.netProfit/);
  assert.doesNotMatch(page, /IconPiggyBank/);
  assert.doesNotMatch(page, /cashNetMovementPeriod/);
  assert.doesNotMatch(page, /CashPanel|HddtComplianceBand/);
  assert.doesNotMatch(page, /FINANCE_INVOICE_QUEUE_HREF/);
  assert.doesNotMatch(page, /\/finance\/inventory-value/);
  assert.match(page, /title=\{powerLiteCopy\.title\}/);
  assert.doesNotMatch(page, /description=\{powerLiteCopy\.description\}/);
  assert.doesNotMatch(page, /attentionBadge|viewAttention|ownerNewsTitle/);
  assert.doesNotMatch(page, /FinanceAttentionSection|FINANCE_ATTENTION_ID/);
  assert.doesNotMatch(page, /basic\.sections\.vat|kpis\.vatInput|kpis\.vatOutput/);
  assert.doesNotMatch(
    page,
    /grossProfitHint|operatingResultHint|inboundTransferHint|inventoryPurchasesHint|operatingExpenseHint|startupCapitalHint|inventoryChangeHint|vatInputHint|netRevenueHint/,
  );
  assert.match(page, /ingredientCostHint/);
  assert.match(page, /inventoryValueHint/);
  assert.match(page, /basic\.sections\.assets/);
  assert.match(page, /kpis\.equipment/);
  assert.match(page, /kpis\.totalAssetValue/);
  assert.match(page, /addMoney/);
  assert.match(page, /financeHref\("\/finance\/equipment"/);
  assert.match(page, /className="pb-4"/);
  assert.match(
    page,
    /<CurrentFundsSection[\s\S]*title=\{financeCopy\.basic\.sections\.assets\}/,
  );
  assert.ok(
    pageBody.indexOf("basic.sections.grossProfit") <
      pageBody.indexOf("basic.sections.periodResult"),
    "Gross profit must appear before period result",
  );
  assert.ok(
    pageBody.indexOf("basic.sections.periodResult") <
      pageBody.indexOf("basic.sections.assets"),
    "Period results must appear before assets",
  );
  assert.ok(
    pageBody.indexOf("basic.sections.assets") <
      pageBody.indexOf("kpis.inventoryClosingValue") ||
      pageBody.indexOf("<CurrentFundsSection") <
        pageBody.indexOf("kpis.inventoryClosingValue"),
    "Assets section must wrap current funds before inventory",
  );
  assert.ok(
    pageBody.indexOf("<CurrentFundsSection") <
      pageBody.indexOf("kpis.inventoryClosingValue"),
    "Current funds must appear before period-end inventory",
  );
  assert.ok(
    pageBody.indexOf("label={financeCopy.basic.kpis.inventoryClosingValue}") <
      pageBody.indexOf("label={financeCopy.basic.kpis.equipment}"),
    "Inventory must appear before equipment",
  );
  assert.ok(
    pageBody.indexOf("label={financeCopy.basic.kpis.equipment}") <
      pageBody.indexOf("label={financeCopy.basic.kpis.totalAssetValue}"),
    "Equipment must appear before total asset value",
  );
  assert.ok(
    pageBody.indexOf("label={financeCopy.basic.kpis.totalAssetValue}") <
      pageBody.indexOf("label={financeCopy.basic.kpis.startupCapital}"),
    "Total asset value must appear before startup capital",
  );
  assert.match(copy, /title: "Tài chính"/);
  assert.match(copy, /netRevenue: "Doanh thu thuần"/);
  assert.match(copy, /ingredientCost: "Giá vốn món"/);
  assert.match(copy, /periodCost: "Chi phí"/);
  assert.match(copy, /inboundTransfer: "Chi phí hàng"/);
  assert.match(copy, /inventoryPurchases: "Chi mua hàng"/);
  assert.match(copy, /grossProfit: "Lợi nhuận gộp"/);
  assert.match(copy, /sections: \{[\s\S]*grossProfit: "Lợi nhuận gộp"/);
  assert.match(copy, /operatingExpense: "Chi vận hành"/);
  assert.match(copy, /startupCapital: "Chi phí ban đầu"/);
  assert.match(copy, /equipment: "Thiết bị"/);
  assert.match(copy, /totalAssetValue: "Tổng giá trị"/);
  assert.match(copy, /assets: "Tài sản"/);
  assert.match(copy, /inventoryClosingValue: "Tồn kho"/);
  assert.match(copy, /reports: "Doanh thu"/);
  assert.match(copy, /inventoryChange: "Biến động tồn kho"/);
  assert.match(copy, /operatingResult: "Kết quả kinh doanh"/);
  assert.match(copy, /inventory: "Tồn kho"/);
  assert.equal(
    (page.match(/className=\{formulaOperatorClass\}/g) ?? []).length,
    8,
  );
  assert.equal((page.match(/<span aria-hidden>−<\/span>/g) ?? []).length, 2);
  assert.equal((page.match(/<span aria-hidden>\+<\/span>/g) ?? []).length, 3);
  assert.equal((page.match(/<span aria-hidden>=<\/span>/g) ?? []).length, 3);
  assert.doesNotMatch(copy, /netProfit: "Lợi nhuận ròng"/);
  assert.doesNotMatch(cockpit, /const netProfit =/);
  assert.match(cockpit, /fetchPeriodGoodsIn/);
  assert.match(cockpit, /branchIds: \[\.\.\.salesBranchIds\]/);
  assert.match(copy, /Đầu kỳ/);
  assert.match(copy, /Không gồm giá vốn món/);
  assert.match(copy, /bankReconciliationLabel: "Giao dịch"/);
  assert.doesNotMatch(copy, /cashDeltaTitle:/);
});

test("finance and admin copy keep domain vocabulary explicit", () => {
  const copy = [read(FINANCE_COPY), read(ADMIN_COPY)].join("\n");

  for (const term of [
    literalWith(String.raw`lợi nhuận thực tế`),
    literalWith(String.raw`food cost`),
    literalWith(String.raw`webhook lỗi`),
    literalWith(String.raw`\bhover\b`),
    literalWith(String.raw`drill-down`),
    literalWith(String.raw`Hoá`, ""),
    literalWith(String.raw`TT 78\/2021`, ""),
    literalWith(String.raw`Nhập \(GRN\)`, ""),
    literalWith(String.raw`Payment provider webhook`),
    literalWith(String.raw`báo cáo doanh thu theo phương thức`),
    literalWith(String.raw`giá vốn nguyên liệu`),
    literalWith(String.raw`Nguyên liệu mua ngoài`),
    literalWith(String.raw`Nơi chi \/ nhà cung cấp`),
    literalWith(String.raw`\bSnapshot\b`),
    literalWith(String.raw`\bcron\b`),
    literalWith(String.raw`\baudit\b`),
    literalWith(String.raw`\bLive\b`),
    literalWith(String.raw`\bmodule\b`),
    literalWith(String.raw`Workspace`),
    literalWith(String.raw`\bvs\b`),
    literalWith(String.raw`offline`),
    literalWith(String.raw`online`),
    literalWith(String.raw`\bagent\b`),
    literalWith(String.raw`template`),
    literalWith(String.raw`tenant-wide`),
    literalWith(String.raw`HĐ tổng hợp B2C`),
  ]) {
    assert.doesNotMatch(copy, term);
  }

  assert.match(copy, /Doanh thu/);
  assert.match(copy, /Doanh thu thuần/);
  assert.match(copy, /Lợi nhuận gộp/);
  assert.match(copy, /Giá vốn món/);
  assert.doesNotMatch(copy, /Bán hàng sau giảm giá/);
  assert.doesNotMatch(copy, /Lãi gộp/);
  assert.doesNotMatch(copy, /Dòng tiền trong kỳ/);
});

test("finance subroutes share the compact surface and operational vocabulary", () => {
  for (const path of FINANCE_SUBROUTE_SURFACES) {
    assert.match(
      read(path),
      /<AppPage width="xwide" density="compact">/,
      `${path} must use the shared compact finance surface`,
    );
  }

  const revenue = read(FINANCE_REVENUE);
  const drill = read(FINANCE_REVENUE_DRILL);
  const bankTable = read(FINANCE_BANK_TABLE);
  const copy = read(FINANCE_COPY);

  assert.doesNotMatch(revenue, /csvHeaders\.colVat|periodTable\.colVat/);
  assert.doesNotMatch(
    revenue,
    /hint=\{revCopy\.kpi\.(totalCollectedHint|netRevenueHint|orderCountHint|aovOrderHint)\}/,
  );
  assert.doesNotMatch(revenue, /description=\{revCopy\.page\.description\}/);
  assert.match(drill, /const netRevenue = totalRevenue - totalTax/);
  assert.match(drill, /label=\{copy\.kpis\.netRevenue\}/);
  assert.match(drill, /label=\{copy\.kpis\.totalCollected\}/);
  for (const term of [
    literalWith(String.raw`\bVAT\b`),
    literalWith(String.raw`payment hoàn tất`),
    literalWith(String.raw`payments\.paid_at`),
    literalWith(String.raw`canonical`),
    literalWith(String.raw`snapshot`),
    literalWith(String.raw`\baudit\b`),
  ]) {
    assert.doesNotMatch(drill, term);
  }
  assert.doesNotMatch(copy, literalWith(String.raw`\bpayment\b`));
  assert.doesNotMatch(copy, literalWith(String.raw`\bwebhook\b`));
  assert.match(bankTable, /BankRowStatus/);
  assert.match(bankTable, /key: "date"/);
  assert.doesNotMatch(bankTable, /key: "action"/);
  assert.match(copy, /title: "Giao dịch"/);
  assert.doesNotMatch(copy, /Đối soát NH/);
});

test("inventory copy uses Vietnamese operational labels on active surfaces", () => {
  const copy = read(INVENTORY_COPY);

  for (const term of [
    literalWith(String.raw`food cost`),
    literalWith(String.raw`\bGRN\b`),
    literalWith(String.raw`\bPO\b`),
    literalWith(String.raw`\bOwner\b`),
    literalWith(String.raw`\baudit\b`),
    literalWith(String.raw`\bsnapshot\b`),
    literalWith(String.raw`\bmode\b`),
    literalWith(String.raw`\bsession\b`),
    literalWith(String.raw`\bLocation\b`),
    literalWith(String.raw`\blocation\b`),
    literalWith(String.raw`\bBlind\b`),
    literalWith(String.raw`\bvs\b`),
    literalWith(String.raw`Recipe`),
    literalWith(String.raw`\bwaste\b`),
    literalWith(String.raw`optional`),
    literalWith(String.raw`\btier\b`),
    literalWith(String.raw`\bserver\b`),
    literalWith(String.raw`compute`),
    literalWith(String.raw`4-eye`),
    literalWith(String.raw`qty ratio`),
    literalWith(String.raw`rolling 15m`),
    literalWith(String.raw`Tiêu thụ`, ""),
  ]) {
    assert.doesNotMatch(copy, term);
  }

  assert.match(copy, /Phiếu nhập liên kết/);
  assert.match(copy, /Đơn mua liên kết/);
  assert.match(copy, /Thực tế so với định mức món/);
  assert.match(copy, /Phiếu hao hụt \/ hủy hàng/);
});

test("print job monitor keeps the owner recovery filter", () => {
  const page = read(PRINT_JOBS_PAGE);
  const client = read(PRINT_JOBS_CLIENT);

  assert.match(page, /PRINT_JOB_ATTENTION_STATUS = "needs_attention"/);
  assert.match(
    page,
    /jobsQuery = jobsQuery\.in\("status", \["failed", "expired"\]\)/,
  );
  assert.match(
    page,
    /failedQuery[\s\S]{0,160}?\.in\("status", \["failed", "expired"\]\)/,
  );
  assert.match(
    client,
    /value=\{PRINT_JOB_ATTENTION_STATUS\}[\s\S]{0,120}?\{PRINT_JOBS_COPY\.attentionStatus\}/,
  );
});

test("branch command landing redirects into Hôm nay while helpers stay available", () => {
  const page = read(BRANCH_PAGE);
  const surface = read(BRANCH_COMMAND_CONFIG);

  assert.match(page, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(page, /\bKpi(?:Row|Card)\b|fetchBranchDayStatus|readinessTitle/);
  assert.match(surface, /readinessPosTitle/);
  assert.match(surface, /readinessPrinterTitle/);
  assert.match(surface, /readinessCheckoutTitle/);
  assert.match(surface, /checkoutApprovalsHref/);
  assert.doesNotMatch(surface, /\/employee\/checkout-approvals/);
});

test("branch runtime reads stay session-scoped with hierarchy-aware checkout projections", () => {
  const data = read(BRANCH_DATA);
  const todayWorkState = read(TODAY_WORK_STATE);
  const attendancePolicy = read(ATTENDANCE_POLICY_MIGRATION);

  assert.match(data, /supabase\.rpc\("list_branch_menu_daily_limits"/);
  assert.match(data, /menuLimitAvailableItems/);
  assert.match(data, /available_to_sell/);
  assert.doesNotMatch(data, /setupActiveMenuItems/);
  assert.doesNotMatch(data, /\.from\("menu_items"\)/);
  assert.doesNotMatch(data, /createServiceClient|\bservice\b/);
  assert.doesNotMatch(todayWorkState, /createServiceClient|countReadClient/);
  assert.match(
    todayWorkState,
    /supabase\s*\.from\("inventory_count_assignments"\)[\s\S]{0,240}?\.eq\("employee_id", employeeId\)/,
  );
  assert.match(
    data,
    /supabase\s*\.from\("pos_sessions"\)[\s\S]{0,200}?\.eq\("tenant_id", claims\.tenant_id\)\s*\.eq\("branch_id", branchId\)/,
  );
  assert.match(
    data,
    /supabase\.rpc\("get_checkout_review_queue", \{[\s\S]{0,120}?p_branch_id: branchId,[\s\S]{0,120}?p_include_rows: false/,
  );
  assert.match(
    data,
    /supabase\.rpc\("get_leave_review_queue", \{[\s\S]{0,120}?p_branch_id: branchId,[\s\S]{0,120}?p_include_rows: false/,
  );
  assert.match(data, /isStoreBranch|branchKind === ["']branch["']/);
  assert.match(data, /branchKind\?:/);
  assert.match(attendancePolicy, /ALTER POLICY "attendance_select"/i);
  assert.match(attendancePolicy, /auth_tenant_id"?\(\)/);
  assert.match(
    attendancePolicy,
    /has_permission"?\("branch_id", 'hr:approve_checkout'::text\)/,
  );
  assert.match(data, /fail-soft/i);
});
