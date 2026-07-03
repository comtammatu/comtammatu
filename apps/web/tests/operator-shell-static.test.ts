import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

test("operator routes use a route group without wrapping station apps", () => {
  assert.equal(
    exists("apps/web/app/(protected)/br/[branchId]/layout.tsx"),
    false,
  );
  for (const path of [
    "apps/web/app/(protected)/br/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  ]) {
    assert.equal(exists(path), true, path);
  }
});

test("operator bottom nav keeps profile out of shift navigation", () => {
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  for (const expected of [
    "`/br/${branchId}`",
    "`/br/${branchId}/shift`",
    "`/br/${branchId}/shift/schedule`",
  ]) {
    assert.ok(bottomNav.includes(expected), expected);
  }
  assert.doesNotMatch(bottomNav, /shift\/profile/);
  assert.doesNotMatch(bottomNav, /shift\/leave/);
  assert.doesNotMatch(bottomNav, /shift\/payslip/);
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/profile`/);
  assert.ok(bottomNav.includes("showBranchManagement"));
  assert.ok(bottomNav.includes("`/br/${branchId}/dashboard`"));
  assert.ok(bottomNav.includes("`/br/${branchId}/settings`"));
  assert.ok(bottomNav.includes("APP_COPY_VI.operatorManagement"));
  assert.doesNotMatch(
    bottomNav,
    /label: messages\.employee\.nav\.profileShort/,
  );
  assert.doesNotMatch(bottomNav, /"\/notifications"/);
  assert.doesNotMatch(bottomNav, /MAX_VISIBLE_ITEMS/);
});

test("operator header keeps profile and notifications in chrome", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );

  assert.match(layout, /IconUser/);
  assert.match(layout, /href=\{`\/br\/\$\{context\.branchId\}\/profile`\}/);
  assert.match(layout, /aria-label=\{messages\.employee\.nav\.profileShort\}/);
  assert.match(layout, /notificationsHref/);
  assert.match(layout, /encodeURIComponent\(`\/br\/\$\{context\.branchId\}`\)/);
  assert.match(layout, /href=\{notificationsHref\}/);
  assert.match(layout, /size="icon-touch"/);
  assert.doesNotMatch(layout, /IconBell data-icon="inline-start"/);
  assert.doesNotMatch(layout, /<Badge/);
  assert.doesNotMatch(layout, /shift\/profile/);
});

test("notifications page provides a safe branch return path", () => {
  const page = read("apps/web/app/(protected)/notifications/page.tsx");

  assert.match(page, /getSafeInternalReturnTo/);
  assert.match(page, /\/br\/\$\{claims\.branch_id\}/);
  assert.match(page, /messages\.notifications\.back/);
});

test("operator home label is today, not Branch Hub", () => {
  const labels = read("packages/shared/src/labels/vi.ts");

  assert.match(labels, /operatorHome: "Hôm nay"/);
  assert.match(labels, /operator_home: "Hôm nay"/);
  assert.doesNotMatch(labels, /operatorHome: "Branch Hub"/);
  assert.doesNotMatch(labels, /Branch Runtime|Branch Ops/);
});

test("operator home renders MODULE_ACL-backed capability tiles", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(home, /resolveOperatorTiles/);
  assert.match(home, /EmployeeHomePageContent/);
  assert.match(home, /mode="today-card"/);
  assert.match(
    home,
    /showTodayCard = canAccess\(claims\.user_role, "employee"\)/,
  );
  assert.match(home, /showManagementCard/);
  assert.match(home, /APP_COPY_VI\.branchCommand/);
  assert.match(home, /href=\{`\$\{basePath\}\/dashboard`\}/);
  assert.match(home, /clock: `\$\{basePath\}\/shift\/clock`/);
  assert.match(home, /count: `\$\{basePath\}\/stock\/count`/);
  assert.match(home, /EmployeeActionSection/);
  assert.match(home, /groups\.map/);
  assert.match(
    home,
    /key: `\$\{group\.id\}-\$\{tile\.moduleKey\}-\$\{tile\.href\}`/,
  );
  assert.match(home, /mobileColumns=\{2\}/);
  assert.doesNotMatch(home, /operatorRuntimeActions/);
  assert.doesNotMatch(home, /operatorOpsActions/);
  assert.doesNotMatch(home, /EmployeeStatusStrip/);
  assert.doesNotMatch(home, /operatorShortcutsStatus/);
  assert.doesNotMatch(home, /OPERATION_HANDOFFS/);
});

test("operator hub owns branch workflow entry tiles", () => {
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const operatorTiles =
    navConfig.split("export const OPERATOR_TILE_ITEMS =")[1] ?? "";

  assert.match(navConfig, /my_shift: "Nhân sự"/);
  assert.match(navConfig, /approvals: "Duyệt"/);
  assert.match(navConfig, /sales_kitchen: "Bán hàng"/);
  assert.match(navConfig, /stock: "Kho hàng"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/shift\/clock"/,
  );
  assert.match(operatorTiles, /hrefTemplate: "\/br\/\{branchId\}\/shift"/);
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/shift\/tasks"/,
  );
  assert.match(operatorTiles, /moduleKey: "employee_checkout_approvals"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/shift\/checkout-approvals"/,
  );
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/employee\/checkout-approvals"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/count-slips"/,
  );
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/inventory\/count-slips"/,
  );
  assert.match(operatorTiles, /hrefTemplate: "\/br\/\{branchId\}\/stock"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/receive"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/stocktake"/,
  );
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/count"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/waste"/,
  );
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/stocktake"/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/transfers"/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/waste/);
  assert.match(operatorTiles, /moduleKey: "branch_menu_limits"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/settings\/menu-limits"/,
  );
  assert.doesNotMatch(navConfig, /branch_setup/);
  assert.doesNotMatch(operatorTiles, /moduleKey: "branch_dashboard"/);
  assert.doesNotMatch(operatorTiles, /moduleKey: "branch_settings"/);
});

test("branch dashboard and settings routes live inside operator shell", () => {
  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/menu-limits/page.tsx",
  ]) {
    const source = read(path);

    assert.match(source, /AppPageHeader|EmployeePage/);
    assert.doesNotMatch(source, /BranchManagementShell/);
    assert.doesNotMatch(source, /management-chrome/);
  }
});

test("pre-clock-in gate disables floor tiles instead of hiding them", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(
    page,
    /tilesLockedBeforeClockIn && lockedGroupIds\.has\(group\.id\)/,
  );
  assert.doesNotMatch(page, /tiles: \[\]/);
});

test("operator home overview KPIs are gated by branch_dashboard access", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(
    home,
    /showOverview = canAccess\(claims\.user_role, "branch_dashboard"\)/,
  );
  assert.match(
    home,
    /showOverview\s*\?\s*fetchBranchDayStatus\(supabase, claims, context\.branchId\)/,
  );
  assert.match(home, /getUnreadCount\(\)/);
  assert.match(home, /formatVND\(day\.todayRevenue\)/);
  assert.match(home, /showOverview && day \?/);
  assert.match(home, /messages\.settings\.branch\.hubOverviewTitle/);
  assert.match(home, /messages\.settings\.branch\.dayRevenueLabel/);
  assert.match(home, /messages\.settings\.branch\.hubOverviewUnreadLabel/);
  assert.match(home, /href=\{`\$\{basePath\}\/dashboard`\}/);
  assert.match(home, /href="\/notifications"/);
  assert.doesNotMatch(home, /count_unread_notifications/);
  assert.doesNotMatch(home, /createServiceClient/);
});

test("operator home renders the unified Cần xử lý queue before domain tile rows (V2, D059)", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(home, /fetchBranchQueueCounts/);
  assert.match(home, /queueRows\.length > 0/);
  assert.match(home, /branchCopy\.queueTitle/);
  assert.match(home, /showQueue = !isFloorRole/);

  const queueIndex = home.indexOf("queueRows.length > 0");
  const groupsIndex = home.indexOf("groups.map((group)");
  assert.ok(queueIndex > 0 && groupsIndex > 0, "both sections must exist");
  assert.ok(
    queueIndex < groupsIndex,
    "queue section must render before domain tile rows",
  );
});

test("manager smart card counts pending waste approvals with checkouts", () => {
  const home = read("apps/web/app/(protected)/employee/page.tsx");

  assert.match(home, /\.eq\("issue_type", "writeoff"\)/);
  assert.match(home, /\.eq\("approval_status", "pending"\)/);
  assert.match(home, /INVENTORY_WASTE_APPROVE/);
  assert.match(home, /pendingCheckouts \+ pendingWaste/);
});
