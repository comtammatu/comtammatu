import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(resolve(repoRoot, path), "utf8");

test("root route owns the Control home", () => {
  const rootPage = read("apps/web/app/(protected)/page.tsx");
  const protectedLayout = read("apps/web/app/(protected)/layout.tsx");
  const overview = read("apps/web/app/_components/control-surface-overview.tsx");

  assert.doesNotMatch(rootPage, /ControlSurfaceShell/);
  assert.match(protectedLayout, /<ControlSurfaceShell/);
  assert.match(rootPage, /<ControlSurfaceOverview/);
  assert.match(rootPage, /loadControlHomeAttention/);
  assert.match(rootPage, /getTodayWorkState/);
  assert.doesNotMatch(overview, /MODULE_ACL\.finance\.path/);
  assert.doesNotMatch(overview, /operationsModules|ModuleLinks/);
  assert.match(overview, /attentionTitle|AttentionQueue/);
  assert.doesNotMatch(rootPage, /redirect\(/);
});

test("Branch home keeps management branch-local and exposes one Owner entry", () => {
  const landing = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );

  assert.equal(
    landing.match(/href: "\/"/g)?.length,
    1,
    "Branch home must expose exactly one Owner surface route",
  );
  assert.match(landing, /ownerLinks =\s*claims\.user_role === "owner"/);
  assert.match(landing, /key: "owner-home"/);
  for (const moduleKey of [
    "menu",
    "orders",
    "inventory",
    "finance",
    "branches",
    "hr",
  ]) {
    assert.doesNotMatch(
      landing,
      new RegExp(`MODULE_ACL\\.${moduleKey}\\.path`),
      `Branch home must not expose the ${moduleKey} Owner surface family`,
    );
  }
  assert.doesNotMatch(landing, /owner-(?:finance|hr|payroll|settings)/);
  assert.doesNotMatch(landing, /APP_COPY_VI\.operatorOpsActions/);
  assert.match(landing, /APP_COPY_VI\.ownerTitle/);
  assert.doesNotMatch(layout, /canUseBranchPicker|canSwitchBranch/);
});

test("Owner surface membership has one ACL source", () => {
  const types = read("packages/shared/src/auth/types.ts");
  const branchHome = read("packages/shared/src/auth/login-destination.ts");
  const scope = read("packages/shared/src/auth/scope.ts");

  assert.doesNotMatch(types, /ADMIN_ROLES/);
  assert.match(branchHome, /canAccess\(claims\.user_role, "owner"\)/);
  assert.match(branchHome, /canAccess\(claims\.user_role, "branch_home"\)/);
  assert.doesNotMatch(scope, /function isAdminRole|ADMIN_ROLES/);
});

test("Control home root is a real responsive landing", () => {
  const overview = read("apps/web/app/_components/control-surface-overview.tsx");
  const copy = read("apps/web/lib/messages/control-surface.ts");

  assert.match(overview, /<AppPage density="compact" width="wide">/);
  assert.match(overview, /<AppPageHeader/);
  assert.match(overview, /<AppSection/);
  assert.match(overview, /AttentionQueue/);
  assert.match(overview, /AppTodayCommandBar/);
  assert.match(overview, /<ItemGroup/);
  assert.match(overview, /AppEmptyState/);
  assert.doesNotMatch(overview, /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(18rem,1fr\)\]/);
  assert.doesNotMatch(overview, /module-link/);
  assert.doesNotMatch(overview, /AppLinkCard|LinkCardGrid/);
  assert.doesNotMatch(overview, /KpiCard/);
  assert.doesNotMatch(copy, /eyebrow: "Toàn hệ thống"/);
  assert.match(copy, /title: "Hôm nay"/);
  assert.match(copy, /attentionTitle: "Cần xử lý"/);
  assert.doesNotMatch(copy, /Chỉ dành cho Owner/);
});

test("proxy resolves post-login destination without device context", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.match(proxy, /resolvePostLoginRedirect\(claims, null\)/);
  assert.doesNotMatch(proxy, /searchParams\.set\(\s*"returnTo"/);
});

test("login action resolves post-login destination from role and scope", () => {
  const actions = read("apps/web/app/(public)/(auth)/login/actions.ts");

  assert.match(actions, /resolvePostLoginRedirect\(claims, null\)/);
});

test("post-login redirect call sites no longer resolve a central-site home branch", () => {
  for (const path of [
    "apps/web/app/(public)/(auth)/login/actions.ts",
    "apps/web/proxy.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /resolveCentralSiteHomeBranchId/, path);
    assert.doesNotMatch(source, /homeBranchId/, path);
  }
});

test("branch shift route separates Branch management from personal work", () => {
  const shiftPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );

  assert.match(shiftPage, /const authState = await loadAuthState\(\)/);
  assert.match(
    shiftPage,
    /authState\.claims\.user_role === "owner"[\s\S]*redirect\(`\/br\/\$\{branchId\}\/team`\)/,
  );
  assert.match(shiftPage, /workflowLayout="stepper"/);
  assert.doesNotMatch(shiftPage, /redirect\("\/me"\)/);
});

test("branch orders route owns operator UI instead of wrapping Owner surface orders", () => {
  const ordersPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/page.tsx",
  );
  const ordersClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
  );
  const orderDetailSheet = read(
    "apps/web/app/(protected)/orders/order-detail-sheet.tsx",
  );

  assert.match(ordersPage, /BranchOperatorPage/);
  assert.match(ordersPage, /OperatorOrdersClient/);
  assert.match(ordersPage, /fetchOrders\(\{ branchId \}\)/);
  assert.match(ordersPage, /parseOperatorBranchId/);
  assert.doesNotMatch(ordersPage, /OrdersPageContent/);
  assert.doesNotMatch(ordersPage, /BranchOpsRefresh/);
  assert.doesNotMatch(ordersPage, /fetchRefunds/);
  assert.match(ordersClient, /ItemGroup/);
  assert.match(ordersClient, /Tabs/);
  assert.match(ordersClient, /operatorActiveTab/);
  assert.match(ordersClient, /order\.status !== "completed"/);
  assert.match(ordersClient, /order\.status !== "cancelled"/);
  assert.match(ordersClient, /OrderDetailSheet/);
  assert.doesNotMatch(ordersClient, /OrdersPageBody|DataTable|AppPageHeader/);
  assert.match(orderDetailSheet, /AppSheet/);
  assert.match(orderDetailSheet, /description="Chi tiết đơn hàng/);
});

test("native branch home pages use the Branch operator interface contract", () => {
  const branchOperatorPage = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );
  const nativePages = [
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/page.tsx",
  ] as const;

  assert.doesNotMatch(
    branchOperatorPage,
    /<div className="flex w-full flex-col gap-3">/,
  );
  assert.doesNotMatch(
    branchOperatorPage,
    /<div className="flex flex-col gap-3">\{children\}<\/div>/,
  );

  for (const path of nativePages) {
    const source = read(path);
    assert.match(
      source,
      /@lib\/branch-operator\/components\/branch-operator-page/,
      path,
    );
    assert.match(source, /BranchOperatorPage/, path);
    assert.doesNotMatch(
      source,
      /@lib\/staff-runtime\/components\/staff-runtime-page/,
      path,
    );
    assert.doesNotMatch(source, /AppPageHeader/, path);
    assert.doesNotMatch(source, /[A-Za-z]+PageContent/, path);
    assert.doesNotMatch(
      source,
      /<BranchOperatorPage[\s\S]*?<div className="flex flex-col gap-3"[\s\S]*?<\/BranchOperatorPage>/,
      path,
    );
  }
});

test("employee pages no longer run page-level branch runtime redirects", () => {
  const pages = [
    "page.tsx",
    "clock/page.tsx",
    "schedule/page.tsx",
    "profile/page.tsx",
    "leave/page.tsx",
    "payslip/page.tsx",
    "count/page.tsx",
  ] as const;

  for (const path of pages) {
    const source = read(`apps/web/lib/staff-runtime/${path}`);
    assert.doesNotMatch(source, /resolveEmployeeBranchRuntimePath/, path);
  }
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/lib/staff-runtime/attendance/page.tsx"),
    ),
    false,
  );

  const employeeHome = read("apps/web/lib/staff-runtime/page.tsx");
  assert.doesNotMatch(employeeHome, /OPERATION_HANDOFFS/);
});
