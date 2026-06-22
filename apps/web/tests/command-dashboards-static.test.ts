import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const ADMIN_PAGE = "apps/web/app/(protected)/admin/dashboard/page.tsx";
const ADMIN_ACTIONS = "apps/web/app/(protected)/admin/dashboard/actions.ts";
const ADMIN_WORK_QUEUE =
  "apps/web/app/(protected)/admin/dashboard/_components/owner-work-queue.tsx";
const ADMIN_COPY = "apps/web/lib/messages/admin.ts";
const FINANCE_PAGE = "apps/web/app/(protected)/finance/page.tsx";
const FINANCE_CASH_PANEL =
  "apps/web/app/(protected)/finance/components/cash-panel.tsx";
const FINANCE_COPY = "apps/web/lib/messages/finance.ts";
const INVENTORY_COPY = "apps/web/lib/messages/inventory.ts";
const PRINT_JOBS_PAGE =
  "apps/web/app/(protected)/admin/settings/printers/jobs/page.tsx";
const PRINT_JOBS_CLIENT =
  "apps/web/app/(protected)/admin/settings/printers/jobs/print-jobs-client.tsx";
const BRANCH_PAGE = "apps/web/app/(protected)/br/[branchId]/dashboard/page.tsx";
const BRANCH_DATA = "apps/web/app/(protected)/br/[branchId]/dashboard/data.ts";
const BACKTICK = "`";

function literalWith(pattern: string, flags = "i"): RegExp {
  return new RegExp(
    `"[^"\\n]*(?:${pattern})[^"\\n]*"|${BACKTICK}[^${BACKTICK}\\n]*(?:${pattern})[^${BACKTICK}\\n]*${BACKTICK}`,
    flags,
  );
}

test("admin dashboard uses canonical KpiCard, not a page-local stat card", () => {
  const page = read(ADMIN_PAGE);

  assert.match(page, /from "@\/components\/kpi\/kpi-card"/);
  assert.match(page, /buildCompareDelta/);
  assert.doesNotMatch(page, /\b(?:function|const)\s+StatCard\b/);
  assert.doesNotMatch(page, /\bDashboardFocus\b/);
});

test("admin dashboard only promotes finance metrics with direct contracts", () => {
  const page = read(ADMIN_PAGE);
  const copy = read(ADMIN_COPY);

  assert.match(page, /label=\{ADMIN_DASHBOARD_COPY\.revenueLabel\}/);
  assert.match(page, /label=\{ADMIN_DASHBOARD_COPY\.operatingExpenseLabel\}/);
  assert.match(page, /label=\{ADMIN_DASHBOARD_COPY\.inventoryValueLabel\}/);
  assert.doesNotMatch(page, /label=\{ADMIN_DASHBOARD_COPY\.cashCollectedLabel\}/);
  assert.doesNotMatch(page, /label=\{ADMIN_DASHBOARD_COPY\.transferCollectedLabel\}/);
  assert.doesNotMatch(page, /label=\{ADMIN_DASHBOARD_COPY\.cashOnHandLabel\}/);
  assert.doesNotMatch(page, /label=\{ADMIN_DASHBOARD_COPY\.grossProfitLabel\}/);
  assert.doesNotMatch(page, /label=\{ADMIN_DASHBOARD_COPY\.netProfitLabel\}/);
  assert.doesNotMatch(page, /label=\{ADMIN_DASHBOARD_COPY\.kitchenCostLabel\}/);
  assert.doesNotMatch(page, /financeKpis\.netProfit/);
  assert.doesNotMatch(copy, /cashCollectedLabel/);
  assert.doesNotMatch(copy, /transferCollectedLabel/);
  assert.doesNotMatch(copy, /cashOnHandLabel/);
  assert.doesNotMatch(copy, /grossProfitLabel/);
  assert.doesNotMatch(copy, /netProfitLabel/);
  assert.doesNotMatch(copy, /kitchenCostLabel/);
});

test("finance basic landing only promotes direct-contract KPI cards", () => {
  const page = read(FINANCE_PAGE);
  const cashPanel = read(FINANCE_CASH_PANEL);
  const copy = read(FINANCE_COPY);

  assert.match(page, /xl:grid-cols-4/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.revenue\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.inventoryValue\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.operatingExpense\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.grossProfit\}/);
  assert.doesNotMatch(page, /financeCopy\.basic\.kpis\.netProfit/);
  assert.doesNotMatch(page, /cockpit\.kpis\.netProfit/);
  assert.doesNotMatch(page, /IconPiggyBank/);
  assert.doesNotMatch(page, /xl:grid-cols-5/);
  assert.match(page, /cashDeltaAfterPaidExpenses/);
  assert.match(cashPanel, /cashDeltaAfterPaidExpenses/);
  assert.doesNotMatch(cashPanel, /\bnetProfit\b/);
  assert.doesNotMatch(copy, /netProfit:/);
  assert.doesNotMatch(copy, /netProfitHint/);
});

test("finance and admin copy keep domain vocabulary explicit", () => {
  const copy = [read(FINANCE_COPY), read(ADMIN_COPY)].join("\n");

  for (const term of [
    literalWith(String.raw`lợi nhuận ròng`),
    literalWith(String.raw`lợi nhuận thực tế`),
    literalWith(String.raw`food cost`),
    literalWith(String.raw`webhook lỗi`),
    literalWith(String.raw`\bhover\b`),
    literalWith(String.raw`drill-down`),
    literalWith(String.raw`Hoá`, ""),
    literalWith(String.raw`TT 78\/2021`, ""),
    literalWith(String.raw`Nhập \(GRN\)`, ""),
    literalWith(String.raw`doanh thu thuần`),
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

  assert.match(copy, /Tiền đã thu/);
  assert.match(copy, /Doanh thu ròng trước VAT/);
  assert.match(copy, /Lãi gộp/);
  assert.match(copy, /Giá vốn món/);
  assert.match(copy, /Dòng tiền sau chi đã trả/);
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
  assert.match(copy, /Tiêu hao\/ngày/);
  assert.match(copy, /Thực tế so với định mức món/);
  assert.match(copy, /Phiếu hao hụt \/ hủy hàng/);
});

test("admin dashboard is the L0 tenant command surface (D017 step 4)", () => {
  const page = read(ADMIN_PAGE);
  // Owner work-queue rendering (incl. the per-branch command links) is
  // extracted into the co-located component; assert links against both.
  const surface = page + read(ADMIN_WORK_QUEUE);

  assert.match(page, /fetchBranchOperatingStatus/);
  assert.match(page, /branchStatusTitle/);
  assert.match(page, /workQueueTitle/);
  assert.match(page, /owner-work-queue/);
  assert.doesNotMatch(page, /SurfaceLinkCard/);
  assert.doesNotMatch(page, /buildSetupCards/);
  assert.doesNotMatch(page, /buildDomainCards/);
  assert.match(surface, /\/admin\/settings\/printers\/jobs\?branch=/);
  assert.match(surface, /status=needs_attention/);
  assert.match(surface, /\/br\/\$\{String\(row\.branchId\)\}\/dashboard/);
});

test("admin dashboard actions stay scoped to the dashboard audience", () => {
  const actions = read(ADMIN_ACTIONS);

  assert.match(
    actions,
    /DASHBOARD_ROLES: readonly StaffRole\[\] = \["owner"\]/,
  );
  assert.match(actions, /export async function fetchBranchOperatingStatus/);
  assert.doesNotMatch(actions, /fetchAdminOverview/);
});

test("print job monitor supports the owner recovery filter from admin dashboard", () => {
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
    /value:\s*PRINT_JOB_ATTENTION_STATUS[\s\S]{0,100}?label:\s*PRINT_JOBS_COPY\.attentionStatus/,
  );
});

test("branch command landing surfaces day metrics and readiness (D017 step 5)", () => {
  const page = read(BRANCH_PAGE);

  assert.match(page, /from "@\/components\/kpi\/kpi-card"/);
  assert.match(page, /fetchBranchDayStatus/);
  assert.match(page, /readinessTitle/);
  assert.match(page, /readinessPosTitle/);
  assert.match(page, /readinessPrinterTitle/);
  assert.match(page, /readinessCheckoutTitle/);
  assert.match(page, /\/employee\/checkout-approvals/);
});

test("branch day status service-client reads carry explicit tenant+branch filters", () => {
  const data = read(BRANCH_DATA);

  assert.match(
    data,
    /service\s*\.from\("pos_sessions"\)[\s\S]{0,200}?\.eq\("tenant_id", claims\.tenant_id\)\s*\.eq\("branch_id", branchId\)/,
  );
  assert.match(
    data,
    /service\s*\.from\("attendance_records"\)[\s\S]{0,200}?\.eq\("tenant_id", claims\.tenant_id\)\s*\.eq\("branch_id", branchId\)/,
  );
  assert.match(data, /fail-soft/i);
});
