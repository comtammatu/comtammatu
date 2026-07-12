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
});

test("Branch Hub promotes branch management and owner workspaces", () => {
  const hub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );

  assert.match(hub, /MODULE_ACL\.menu\.path/);
  assert.match(hub, /MODULE_ACL\.finance\.path/);
  assert.match(hub, /MODULE_ACL\.hr_payroll\.path/);
  assert.match(hub, /APP_COPY_VI\.operatorOpsActions/);
  assert.match(hub, /APP_COPY_VI\.storeManagement/);
  assert.match(layout, /canUseBranchPicker && context\.canSwitchBranch/);
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

  assert.match(
    read("apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx"),
    /BranchStockOnHandClient/,
  );
  assert.match(
    read("apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx"),
    /redirect\(`\/br\/\$\{branchId\}`\)/,
  );
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
