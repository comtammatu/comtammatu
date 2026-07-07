import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { ResolvedOperatorTileGroup } from "@comtammatu/shared/auth";
import { getOperatorMoreGroups } from "../app/(protected)/br/[branchId]/(operator)/_lib/operator-home-contract";

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
  assert.ok(bottomNav.includes("`/br/${branchId}/pos-sessions`"));
  assert.ok(bottomNav.includes("`/br/${branchId}/settings`"));
  assert.ok(bottomNav.includes("`/br/${branchId}/more`"));
  assert.ok(bottomNav.includes("branchOverflowPrefixes"));

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
  const appHeader = read("apps/web/app/components/app-header.tsx");

  assert.match(layout, /homeHref=\{`\/br\/\$\{context\.branchId\}`\}/);
  assert.match(layout, /homeAriaLabel=\{APP_COPY_VI\.operatorHome\}/);
  assert.match(appHeader, /homeHref\?: string/);
  assert.match(appHeader, /<Link[\s\S]*href=\{href\}/);
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
  assert.match(home, /EmployeePage/);
  assert.match(
    home,
    /showTodayCard =\s*canAccess\(claims\.user_role, "employee"\)(?: && claims\.user_role !== "owner")?/,
  );
  assert.match(home, /showManagementCard/);
  const todaySource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-today-status.tsx",
  );
  assert.match(todaySource, /mode="compact-status"/);
  assert.match(
    home,
    /groups\.map/,
  );
  assert.match(home, /EmployeeActionSection/);
  assert.match(home, /resolveOperatorTileIcon/);
  assert.match(
    home,
    /isCentral\s*\?\s*centralGroups\s*:\s*branchTodayGroups/,
  );
  assert.match(home, /showTodayCard\s*\?/);
  assert.match(
    home,
    /key: `\$\{group\.id\}-\$\{tile\.moduleKey\}-\$\{tile\.href\}`/,
  );
  assert.match(
    home,
    /mobileColumns=\{group\.id === "sales_kitchen" \? 1 : 2\}/,
  );
  assert.doesNotMatch(home, /operatorRuntimeActions/);
  assert.doesNotMatch(home, /operatorOpsActions/);
  assert.doesNotMatch(home, /EmployeeStatusStrip/);
  assert.doesNotMatch(home, /operatorShortcutsStatus/);
  assert.doesNotMatch(home, /OPERATION_HANDOFFS/);
});

test("operator more renders only tiles hidden from Today", () => {
  const more = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/more/page.tsx",
  );

  assert.match(more, /resolveOperatorTiles/);
  assert.match(more, /getOperatorMoreGroups/);
  assert.match(more, /centralMoreTitle/);
  assert.match(more, /moreEmptyTitle/);
  assert.doesNotMatch(more, /redirect\(/);
});

test("operator more group resolver removes home-visible shortcuts", () => {
  const tile = (href: string, moduleKey = "inventory") => ({
    moduleKey,
    href,
    label: href,
    icon: "Package",
    group: "stock",
  });
  const groups = [
    {
      id: "sales_kitchen",
      title: "Bán hàng",
      tiles: [
        tile("/br/1/pos", "pos"),
        tile("/br/1/runner", "runner"),
        tile("/br/1/kds", "kds"),
        tile("/br/1/menu-limits", "branch_menu_limits"),
        tile("/br/1/orders", "orders"),
      ],
    },
    {
      id: "stock",
      title: "Kho hàng",
      tiles: [tile("/br/1/stock"), tile("/br/1/stock/receive")],
    },
  ] as ResolvedOperatorTileGroup[];

  const moreGroups = getOperatorMoreGroups(groups, "branch");
  assert.deepEqual(
    moreGroups.flatMap((group) => group.tiles.map((tile) => tile.href)),
    ["/br/1/menu-limits", "/br/1/orders", "/br/1/stock", "/br/1/stock/receive"],
  );
});

test("operator hub owns branch workflow entry tiles", () => {
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const operatorTiles =
    navConfig.split("export const OPERATOR_TILE_ITEMS =")[1] ?? "";

  assert.match(navConfig, /my_shift: "Nhân sự"/);
  assert.match(navConfig, /approvals: "Duyệt"/);
  assert.match(navConfig, /sales_kitchen: "Bán hàng"/);
  assert.match(navConfig, /stock: "Kho hàng"/);
  assert.doesNotMatch(navConfig, /office_bridge/);
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
  assert.doesNotMatch(operatorTiles, /branch_pos_sessions/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/waste"/,
  );
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/stocktake"/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/transfers"/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/inventory\/waste/);
  assert.doesNotMatch(operatorTiles, /hrefTemplate: "\/(menu|hr|inventory)"/);
  assert.match(operatorTiles, /moduleKey: "branch_menu_limits"/);
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/menu-limits"/,
  );
  assert.doesNotMatch(navConfig, /branch_setup/);
  assert.doesNotMatch(operatorTiles, /moduleKey: "branch_dashboard"/);
  assert.doesNotMatch(operatorTiles, /moduleKey: "branch_settings"/);
});

test("branch dashboard and settings routes live inside operator shell", () => {
  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
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

  // Sales KPIs additionally require branch_kind "branch" — central sites
  // keep their home to curated job tiles (D066).
  assert.match(
    home,
    /showOverview =\s*canAccess\(claims\.user_role, "branch_dashboard"\) && branchKind === "branch"/,
  );
  
  const overviewSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-overview-section.tsx",
  );

  assert.match(
    overviewSource,
    /fetchBranchDayStatus/,
  );
  assert.match(overviewSource, /getUnreadCount\(\)/);
  assert.match(overviewSource, /formatVND\(day\.todayRevenue\)/);
  assert.match(overviewSource, /messages\.settings\.branch\.hubOverviewTitle/);
  assert.match(overviewSource, /messages\.settings\.branch\.dayRevenueLabel/);
  assert.match(overviewSource, /messages\.settings\.branch\.hubOverviewUnreadLabel/);
  assert.match(overviewSource, /href=\{`\$\{basePath\}\/dashboard`\}/);
  assert.match(overviewSource, /href="\/notifications"/);
  assert.doesNotMatch(overviewSource, /count_unread_notifications/);
  assert.doesNotMatch(overviewSource, /createServiceClient/);
});

test("operator home renders the unified Cần xử lý queue before domain tile rows (V2, D059)", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  const queueSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-queue-section.tsx",
  );

  assert.match(queueSource, /fetchBranchQueueCounts/);
  assert.match(queueSource, /queueRows\.length === 0/);
  assert.match(queueSource, /branchCopy\.queueTitle/);

  // Instead of checking order (queue was moved to sidebar), check that it's rendered conditionally
  assert.match(home, /!\isFloorRole \|\| showOverview/);
  assert.match(home, /<HubQueueSection/);
});

test("operator today shift and profile screens use responsive branch layout", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const employeeHome = read("apps/web/lib/employee/page.tsx");
  const profile = read("apps/web/lib/employee/profile/page.tsx");
  const operatorProfile = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/page.tsx",
  );
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  assert.match(layout, /md:max-w-3xl lg:max-w-5xl xl:max-w-6xl/);
  assert.doesNotMatch(layout, /\s+mobile\s+contentClassName=/);
  assert.match(bottomNav, /position="static"/);
  assert.match(bottomNav, /hideOnDesktop=\{false\}/);
  assert.match(home, /flex-col lg:flex-row/);
  assert.match(home, /lg:w-80 xl:w-96/);
  assert.match(employeeHome, /workflowLayout === "stepper"/);
  assert.match(employeeHome, /lg:grid-cols-5/);
  assert.match(operatorProfile, /link\.key === "payslip"/);
  assert.doesNotMatch(operatorProfile, /permissions/);
  assert.match(operatorProfile, /showWorkspaceLinks=\{false\}/);
  assert.match(profile, /showWorkspaceLinks = true/);
  assert.match(profile, /showWorkspaceLinks && workspaceLinks\.length > 0/);
  assert.match(profile, /lg:grid-cols-3/);
  assert.match(profile, /columns=\{2\}/);
});

test("manager smart card counts pending waste approvals with checkouts", () => {
  const home = read("apps/web/lib/employee/page.tsx");

  assert.match(home, /\.eq\("issue_type", "writeoff"\)/);
  assert.match(home, /\.eq\("approval_status", "pending"\)/);
  assert.match(home, /INVENTORY_WASTE_APPROVE/);
  assert.match(home, /pendingCheckouts \+ pendingWaste/);
});
