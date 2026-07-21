import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const ADMIN_COPY = "apps/web/lib/messages/owner.ts";
const FINANCE_PAGE = "apps/web/app/(protected)/finance/page.tsx";
const FINANCE_COCKPIT = "apps/web/app/(protected)/finance/_lib/finance-cockpit.ts";
const FINANCE_COPY = "apps/web/lib/messages/finance.ts";
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
const TODAY_WORK_STATE =
  "apps/web/lib/staff-runtime/_lib/today-work-state.ts";
const ATTENDANCE_POLICY_MIGRATION =
  "supabase/migration-archive/20260719070350_align_attendance_checkout_read_policy.sql";
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
  const cockpit = read(FINANCE_COCKPIT);
  const copy = read(FINANCE_COPY);

  assert.match(page, /xl:grid-cols-4/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.moneyCollected\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.netProfit\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.inventoryValue\}/);
  assert.match(page, /label=\{financeCopy\.basic\.kpis\.operatingExpense\}/);
  assert.doesNotMatch(page, /label=\{financeCopy\.basic\.kpis\.grossProfit\}/);
  assert.doesNotMatch(page, /financeCopy\.basic\.kpis\.netRevenue/);
  assert.match(page, /cockpit\.kpis\.netProfit/);
  assert.doesNotMatch(page, /IconPiggyBank/);
  assert.doesNotMatch(page, /xl:grid-cols-5/);
  assert.doesNotMatch(page, /cashNetMovementPeriod/);
  assert.doesNotMatch(page, /CashPanel|HddtComplianceBand/);
  assert.doesNotMatch(page, /FINANCE_INVOICE_QUEUE_HREF/);
  assert.doesNotMatch(page, /\/finance\/inventory-value/);
  assert.match(
    page,
    /title=\{powerLiteCopy\.title\}[\s\S]{0,120}?description=\{powerLiteCopy\.description\}/,
  );
  assert.match(
    page,
    /<FinanceAttentionSection exceptions=\{cockpit\.exceptions\}/,
  );
  assert.match(page, /item\.tone !== "neutral"/);
  assert.ok(
    pageBody.indexOf("<KpiRow") < pageBody.indexOf("<FinanceAttentionSection"),
    "Finance Basic KPIs must appear before the exception queue",
  );
  assert.equal((pageBody.match(/<FinanceAttentionSection/g) ?? []).length, 1);
  assert.match(copy, /title: "Sức khỏe tài chính"/);
  assert.match(copy, /moneyCollected: "Doanh thu"/);
  assert.match(copy, /netProfit: "Lợi nhuận ròng"/);
  assert.match(copy, /netProfitHint: "Doanh thu − chi vận hành"/);
  assert.match(cockpit, /const netProfit = totalCollected - operatingExpense/);
  assert.match(copy, /Tồn đầu kỳ/);
  assert.match(copy, /số lượng kho × giá vốn chuyển động/);
  assert.match(copy, /gồm đã trả\/chưa trả/);
  assert.match(copy, /không gồm nhập hàng\/NCC/);
  assert.match(copy, /Đối soát ngân hàng cần xử lý/);
  assert.match(page, /FinanceAttentionSection/);
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

  assert.match(copy, /Doanh thu/);
  assert.match(copy, /Bán hàng sau giảm giá/);
  assert.match(copy, /Lãi gộp/);
  assert.match(copy, /Giá vốn món/);
  assert.doesNotMatch(copy, /Dòng tiền trong kỳ/);
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

test("branch command landing surfaces operations and readiness", () => {
  const page = read(BRANCH_PAGE);
  // Per-row readiness config (buildReadinessItems) is extracted into the
  // co-located command-config; assert readiness keys against both sources.
  const surface = page + read(BRANCH_COMMAND_CONFIG);

  assert.doesNotMatch(page, /\bKpi(?:Row|Card)\b/);
  assert.match(page, /fetchBranchDayStatus/);
  assert.match(page, /readinessTitle/);
  assert.match(surface, /readinessPosTitle/);
  assert.match(surface, /readinessPrinterTitle/);
  assert.match(surface, /readinessCheckoutTitle/);
  assert.match(surface, /checkoutApprovalsHref/);
  assert.match(page, /branch\.branch_kind !== "branch"/);
  assert.match(page, /const floorHref =[\s\S]*day\.tablesTotal <= 0/);
  assert.match(page, /day\.setupActiveTerminals <= 0/);
  assert.match(page, /\/br\/\$\{branchId\}\/shift\/checkout-approvals/);
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
  assert.match(attendancePolicy, /ALTER POLICY "attendance_select"/i);
  assert.match(attendancePolicy, /auth_tenant_id"?\(\)/);
  assert.match(
    attendancePolicy,
    /has_permission"?\("branch_id", 'hr:approve_checkout'::text\)/,
  );
  assert.match(data, /fail-soft/i);
});
