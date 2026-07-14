import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

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
const BRANCH_PAGE =
  "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx";
const BRANCH_DATA =
  "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/data.ts";
const BACKTICK = "`";

function literalWith(pattern: string, flags = "i"): RegExp {
  return new RegExp(
    `"[^"\\n]*(?:${pattern})[^"\\n]*"|${BACKTICK}[^${BACKTICK}\\n]*(?:${pattern})[^${BACKTICK}\\n]*${BACKTICK}`,
    flags,
  );
}

test("finance basic landing only promotes direct-contract KPI cards", () => {
  const page = read(FINANCE_PAGE);
  const pageBody = page.slice(
    page.indexOf("export default async function FinancePage"),
  );
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
  assert.match(page, /cashNetMovementPeriod/);
  assert.match(cashPanel, /cashNetMovementPeriod/);
  assert.doesNotMatch(cashPanel, /\bnetProfit\b/);
  assert.match(
    page,
    /title=\{powerLiteCopy\.title\}[\s\S]{0,120}?description=\{powerLiteCopy\.description\}/,
  );
  assert.match(
    page,
    /<FinanceAttentionSection exceptions=\{cockpit\.exceptions\}/,
  );
  assert.match(page, /item\.tone !== "neutral"/);
  assert.match(page, /item\.href !== FINANCE_INVOICE_QUEUE_HREF/);
  assert.ok(
    pageBody.indexOf("<KpiRow") < pageBody.indexOf("<FinanceAttentionSection"),
    "Finance Basic KPIs must appear before the exception queue",
  );
  assert.ok(
    pageBody.indexOf("<FinanceAttentionSection") <
      pageBody.indexOf("<CashPanel"),
    "the exception queue must appear before supporting cash detail",
  );
  assert.ok(
    pageBody.indexOf("<CashPanel") < pageBody.indexOf("<HddtComplianceBand"),
    "HĐĐT detail must remain a supporting section after cash detail",
  );
  assert.match(copy, /title: "Sức khỏe tài chính"/);
  assert.match(copy, /doanh thu ròng \$\{beforeVat\}/);
  assert.match(copy, /cashDeltaTitle: "Dòng tiền trong kỳ"/);
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
  assert.match(copy, /Doanh thu ròng/);
  assert.match(copy, /Lãi gộp/);
  assert.match(copy, /Giá vốn món/);
  assert.match(copy, /Dòng tiền trong kỳ/);
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
    /value:\s*PRINT_JOB_ATTENTION_STATUS[\s\S]{0,100}?label:\s*PRINT_JOBS_COPY\.attentionStatus/,
  );
});

test("Branch dashboard compatibility route resolves to the canonical Hub", () => {
  const page = read(BRANCH_PAGE);

  assert.match(page, /parseOperatorBranchId/);
  assert.match(page, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(page, /fetchBranchDayStatus|KpiRow|KpiCard/);
});

test("Branch Hub queue service reads carry explicit tenant and branch filters", () => {
  const data = read(BRANCH_DATA);

  assert.doesNotMatch(data, /fetchBranchDayStatus|todayRevenue|paidOrders/);
  assert.doesNotMatch(data, /\.from\("payments"\)|\.from\("tables"\)/);
  assert.match(
    data,
    /service\s*\.from\("attendance_records"\)[\s\S]{0,200}?\.eq\("tenant_id", claims\.tenant_id\)\s*\.eq\("branch_id", branchId\)/,
  );
  assert.match(
    data,
    /\.from\("stock_transfers"\)[\s\S]{0,220}?\.eq\("tenant_id", claims\.tenant_id\)\s*\.eq\("to_branch_id", branchId\)/,
  );
});
