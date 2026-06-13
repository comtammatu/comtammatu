import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const ADMIN_PAGE = "apps/web/app/(protected)/admin/dashboard/page.tsx";
const ADMIN_ACTIONS = "apps/web/app/(protected)/admin/dashboard/actions.ts";
const BRANCH_PAGE = "apps/web/app/(protected)/br/[branchId]/dashboard/page.tsx";
const BRANCH_DATA = "apps/web/app/(protected)/br/[branchId]/dashboard/data.ts";

test("admin dashboard uses canonical KpiCard, not a page-local stat card", () => {
  const page = read(ADMIN_PAGE);

  assert.match(page, /from "@\/components\/kpi\/kpi-card"/);
  assert.match(page, /buildCompareDelta/);
  assert.doesNotMatch(page, /\b(?:function|const)\s+StatCard\b/);
  assert.doesNotMatch(page, /\bDashboardFocus\b/);
});

test("admin dashboard is the L0 tenant command surface (D017 step 4)", () => {
  const page = read(ADMIN_PAGE);

  assert.match(page, /fetchBranchOperatingStatus/);
  assert.match(page, /branchStatusTitle/);
  assert.match(page, /setupTitle/);
  assert.match(page, /domainTitle/);
  assert.match(page, /\/br\/\$\{String\(row\.branchId\)\}\/dashboard/);
});

test("admin dashboard actions stay scoped to the dashboard audience", () => {
  const actions = read(ADMIN_ACTIONS);

  assert.match(
    actions,
    /DASHBOARD_ROLES: readonly StaffRole\[\] = \["owner"\]/,
  );
  assert.match(actions, /export async function fetchBranchOperatingStatus/);
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
