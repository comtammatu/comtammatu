import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route delegates single-branch entry to the work location resolver", () => {
  const rootPage = read("apps/web/app/page.tsx");
  const picker = read("apps/web/app/_components/work-location-picker-page.tsx");

  assert.match(rootPage, /WorkLocationPickerPage/);
  assert.doesNotMatch(rootPage, /resolvePostLoginRedirect/);
  assert.doesNotMatch(rootPage, /resolveBranchHubContextFromHeaders/);
  assert.doesNotMatch(rootPage, /redirect\(getDefaultRedirect\(claims\)\)/);
  assert.match(picker, /notFound, redirect/);
  assert.match(picker, /orderedSites\.length === 1/);
  assert.match(picker, /redirect\(`\/br\/\$\{soleBranch\.id\}`\)/);
  assert.match(picker, /canAccess\([\s\S]*"admin_dashboard"/);
  assert.match(picker, /href=\{MODULE_ACL\.admin_dashboard\.path\}/);
  assert.match(picker, /APP_COPY_VI\.adminDashboardTitle/);
  assert.doesNotMatch(picker, /officePlane|Văn phòng/);
});

test("Branch Hub keeps management branch-local and exposes one Owner Admin entry", () => {
  const hub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );

  assert.equal(
    hub.match(/MODULE_ACL\.admin_dashboard\.path/g)?.length,
    1,
    "Branch Hub must expose exactly one Admin Dashboard route",
  );
  assert.match(
    hub,
    /ownerAdminLinks =\s*[\s\S]*canAccess\(claims\.user_role, "admin_dashboard"\)/,
  );
  assert.match(hub, /owner-admin-dashboard/);
  for (const moduleKey of [
    "menu",
    "orders",
    "inventory",
    "finance",
    "branches",
    "hr",
  ]) {
    assert.doesNotMatch(
      hub,
      new RegExp(`MODULE_ACL\\.${moduleKey}\\.path`),
      `Branch Hub must not expose the ${moduleKey} Admin Dashboard family`,
    );
  }
  assert.doesNotMatch(hub, /owner-(?:finance|hr|payroll|settings)/);
  assert.match(hub, /APP_COPY_VI\.operatorOpsActions/);
  assert.match(hub, /APP_COPY_VI\.adminDashboardTitle/);
  assert.match(layout, /canUseBranchPicker && context\.canSwitchBranch/);
});

test("Admin Dashboard membership has one ACL source", () => {
  const types = read("packages/shared/src/auth/types.ts");
  const branchHub = read("packages/shared/src/auth/branch-hub.ts");
  const scope = read("packages/shared/src/auth/scope.ts");

  assert.doesNotMatch(types, /ADMIN_ROLES/);
  assert.doesNotMatch(branchHub, /function isAdminRole|role === "owner"/);
  assert.match(branchHub, /canAccess\(claims\.user_role, "admin_dashboard"\)/);
  assert.doesNotMatch(scope, /function isAdminRole|ADMIN_ROLES/);
});

test("Admin Dashboard root is a real responsive hub", () => {
  const admin = read("apps/web/app/(protected)/admin/page.tsx");

  assert.match(admin, /<AppPage density="compact" width="wide">/);
  assert.match(admin, /<AppPageHeader/);
  assert.match(admin, /<AppSection/);
  assert.match(admin, /<LinkCardGrid className="xl:grid-cols-3">/);
  assert.match(admin, /<AppLinkCard/);
  assert.match(admin, /MODULE_ACL\.finance\.path/);
  assert.match(admin, /MODULE_ACL\.inventory\.path/);
  assert.match(admin, /MODULE_ACL\.settings\.path/);
  assert.doesNotMatch(admin, /redirect\(/);
  assert.doesNotMatch(admin, /KpiCard/);
});

test("proxy passes device context into post-login redirect", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.match(proxy, /resolveBranchHubContextFromHeaders/);
  assert.match(
    proxy,
    /resolvePostLoginRedirect\(claims, null, branchHubContext\)/,
  );
  assert.doesNotMatch(proxy, /searchParams\.set\(\s*"returnTo"/);
});

test("login action passes device context into post-login redirect", () => {
  const actions = read("apps/web/app/(public)/(auth)/login/actions.ts");

  assert.match(
    actions,
    /resolveBranchHubContextFromHeaders\(await headers\(\)\)/,
  );
  assert.match(
    actions,
    /resolvePostLoginRedirect\(claims, null, branchHubContext\)/,
  );
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

test("proxy no longer carries /employee compatibility redirects", () => {
  const proxy = read("apps/web/proxy.ts");

  assert.doesNotMatch(proxy, /resolveLegacyEmployeeBranchRuntimePath/);
  assert.doesNotMatch(proxy, /pathname\.startsWith\("\/employee"\)/);
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/lib/staff-runtime/_lib/branch-runtime-redirect.ts",
      ),
    ),
    false,
  );
});

test("branch shift route keeps floor-staff daily work visible", () => {
  const shiftPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );

  assert.match(shiftPage, /const authState = await loadAuthState\(\)/);
  assert.match(
    shiftPage,
    /authState\.claims\.user_role === "owner"[\s\S]*redirect\(`\/br\/\$\{branchId\}\/team`\)/,
  );
  assert.match(shiftPage, /authState\.claims\.user_role === "branch_manager"/);
  assert.match(
    shiftPage,
    /mode=\{isBranchManager \? "manager-dashboard" : "full"\}/,
  );
  assert.doesNotMatch(shiftPage, /mode="manager-dashboard"/);
});

test("branch orders route owns operator UI instead of wrapping Office orders", () => {
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
  assert.match(ordersClient, /TabsList/);
  assert.match(ordersClient, /operatorActiveTab/);
  assert.match(ordersClient, /order\.status !== "completed"/);
  assert.match(ordersClient, /order\.status !== "cancelled"/);
  assert.match(ordersClient, /OrderDetailSheet/);
  assert.doesNotMatch(ordersClient, /OrdersPageBody|DataTable|AppPageHeader/);
  assert.match(orderDetailSheet, /SheetDescription/);
  assert.match(orderDetailSheet, /<SheetDescription className="sr-only">/);
});

test("native branch hub pages use the Branch operator interface contract", () => {
  const branchOperatorPage = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );
  const nativePages = [
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
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
