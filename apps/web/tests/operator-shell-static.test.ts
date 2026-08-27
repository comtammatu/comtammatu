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
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  ]) {
    assert.equal(exists(path), true, path);
  }
});

test("operator bottom nav stays limited to daily jobs", () => {
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const capabilities = read(
    "packages/shared/src/auth/operator-capabilities.ts",
  );
  const labels = read("packages/shared/src/labels/vi.ts");

  assert.match(bottomNav, /function projectPrimaryTabs/);
  assert.match(bottomNav, /tabs: readonly ResolvedBranchPrimaryTab\[\]/);
  assert.match(layout, /resolveBranchPrimaryTabs\(/);
  assert.match(layout, /tabs=\{primaryTabs\}/);
  assert.doesNotMatch(layout, /showEmployeeLinks/);
  assert.doesNotMatch(layout, /showBranchManagement/);
  assert.doesNotMatch(layout, /canUseShiftTab/);
  assert.doesNotMatch(
    layout,
    /canAccess\(claims\.user_role, "branch_settings"\) \|\|/,
  );
  assert.match(capabilities, /export function resolveBranchPrimaryTabs/);
  assert.match(navConfig, /export const BRANCH_PRIMARY_TAB_ITEMS/);
  assert.match(navConfig, /id: "tools"/);
  assert.match(navConfig, /BRANCH_TEAM_MATCH_PATH_SUFFIXES/);
  assert.match(navConfig, /BRANCH_KHO_MATCH_PATH_SUFFIXES/);
  assert.match(navConfig, /BRANCH_TOOLS_MATCH_PATH_SUFFIXES/);
  assert.match(navConfig, /"\/team\/roster"/);
  assert.doesNotMatch(bottomNav, /shift\/profile/);
  assert.doesNotMatch(bottomNav, /href: `\/br\/\$\{branchId\}\/shift\/leave`/);
  assert.doesNotMatch(bottomNav, /shift\/payslip/);
  assert.match(navConfig, /id: "schedule"/);
  assert.match(navConfig, /id: "profile"/);
  assert.match(navConfig, /hideForOwner: true/);
  assert.match(labels, /employeeSchedule: "Lịch ca"/);
  assert.match(labels, /employeeProfileShort: "Hồ sơ"/);
  assert.match(labels, /branchNavTeam: "Đội"/);
  assert.match(labels, /branchNavStock: "Kho"/);
  assert.match(bottomNav, /CalendarDays/);
  assert.match(bottomNav, /\bUser,/);
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/feedback`/);
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/dashboard`/);
  assert.doesNotMatch(bottomNav, /label: APP_COPY_VI\.operations/);
  assert.doesNotMatch(bottomNav, /icon: LayoutDashboard/);
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/more`/);
  assert.equal(
    exists("apps/web/app/(protected)/br/[branchId]/(operator)/more/page.tsx"),
    false,
    "more page must stay deleted",
  );
  assert.doesNotMatch(bottomNav, /branchManagementOverflowPrefixes/);
  assert.doesNotMatch(bottomNav, /Ellipsis/);
  assert.doesNotMatch(
    bottomNav,
    /label: messages\.operator\.nav\.profileShort/,
  );
  assert.doesNotMatch(bottomNav, /label: messages\.operator\.nav\.schedule/);
  assert.doesNotMatch(bottomNav, /"\/notifications"/);
  assert.doesNotMatch(bottomNav, /MAX_VISIBLE_ITEMS/);
  assert.match(labels, /branchTools: "Công cụ"/);
  const settingsMessages = read("apps/web/lib/messages/settings.ts");
  assert.match(settingsMessages, /centralNavStock: "Tồn"/);
  // R04: central residual pad escapes to Control home `/`; no `/br` daily hub.
  assert.match(bottomNav, /function centralResidualNavItems/);
  assert.match(bottomNav, /href: "\/"/);
  assert.match(bottomNav, /href: "\/inventory\/production"/);
  assert.doesNotMatch(bottomNav, /href: "\/inventory"/);
  assert.doesNotMatch(bottomNav, /function centralNavItems/);
  assert.match(layout, /branchNavBadgeCounts/);
  assert.match(layout, /fetchBranchQueueCounts/);
  assert.match(bottomNav, /tab\.badge === "stock"/);
});

test("operator header shows branch context and keeps profile and notifications", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const appHeader = read("apps/web/app/components/app-header.tsx");

  assert.match(
    layout,
    /homeHref=\{\s*branchKind === "branch"\s*\?\s*`\/br\/\$\{context\.branchId\}`\s*:\s*"\/"\s*\}/,
  );
  assert.match(
    layout,
    /homeAriaLabel=\{\s*branchKind === "branch"\s*\?\s*APP_COPY_VI\.branchHome\s*:\s*APP_COPY_VI\.ownerTitle\s*\}/,
  );
  assert.match(layout, /subtitle=\{ROLE_LABEL_VI\[claims\.user_role\]\}/);
  assert.match(layout, /subtitleHiddenOnMobile/);
  assert.match(layout, /\swide\s/);
  assert.doesNotMatch(layout, /showBrandText=\{false\}/);
  assert.match(layout, /context\.branch\.name\.replace\(\/\^Chi nhánh\\s\+\//);
  assert.match(layout, /className="sm:hidden"/);
  assert.match(layout, /className="hidden sm:inline"/);
  assert.match(appHeader, /homeHref\?: string/);
  assert.match(appHeader, /showThemeToggle\?: boolean/);
  assert.match(appHeader, /<Link[\s\S]*href=\{href\}/);
  assert.match(appHeader, /"min-h-11 min-w-11 shrink-0 justify-center"/);
  assert.doesNotMatch(layout, /IconLayoutDashboard|IconShieldAlert/);
  assert.match(layout, /showThemeToggle=\{!canOpenOwnerHome\}/);
  assert.match(layout, /\{canOpenOwnerHome \? \(/);
  assert.match(layout, /<DropdownMenu>/);
  assert.match(layout, /<ThemeMenuItem className="min-h-12 text-sm" \/>/);
  assert.doesNotMatch(
    layout,
    /href=\{`\/br\/\$\{context\.branchId\}\/dashboard`\}/,
  );
  assert.doesNotMatch(
    layout,
    /href=\{`\/br\/\$\{context\.branchId\}\/menu-limits`\}/,
  );
  assert.doesNotMatch(
    layout,
    /href=\{`\/br\/\$\{context\.branchId\}\/feedback`\}/,
  );
  assert.doesNotMatch(
    layout,
    /href=\{`\/br\/\$\{context\.branchId\}\/close-day`\}/,
  );
  assert.doesNotMatch(
    layout,
    /href=\{`\/br\/\$\{context\.branchId\}\/team`\}/,
  );
  assert.doesNotMatch(layout, /IconUsersRound/);
  assert.doesNotMatch(layout, /\{APP_COPY_VI\.branchCommand\}/);
  assert.doesNotMatch(layout, /MODULE_ACL\.branch_feedback\.label/);
  assert.match(layout, /IconUser/);
  assert.match(layout, /href=\{`\/br\/\$\{context\.branchId\}\/profile`\}/);
  assert.match(layout, /aria-label=\{messages\.operator\.nav\.profileShort\}/);
  const bell = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-notification-bell.tsx",
  );
  const sharedBell = read("apps/web/app/_components/notification-bell.tsx");
  assert.match(layout, /<OperatorNotificationBell/);
  assert.doesNotMatch(layout, /notificationsReturnTo/);
  assert.doesNotMatch(
    layout,
    /<OperatorNotificationBell[\s\S]*returnTo=\{/,
  );
  assert.doesNotMatch(
    layout,
    /returnTo=\{`\/br\/\$\{(?:context\.)?branchId\}`\}/,
  );
  assert.match(bell, /from "@\/_components\/notification-bell"/);
  assert.match(bell, /<NotificationBell/);
  assert.match(bell, /usePathname\(\)/);
  assert.match(bell, /useSearchParams\(\)/);
  assert.match(bell, /returnTo=\{returnTo \|\| currentPath\}/);
  assert.doesNotMatch(bell, /messages\.employee\.(?:nav|header)/);
  assert.match(sharedBell, /messages\.notifications\.bellAriaLabel/);
  assert.match(sharedBell, /encodeURIComponent/);
  assert.match(sharedBell, /"icon-touch"/);
  assert.match(sharedBell, /channelSuffix: "peek"/);
  assert.match(
    sharedBell,
    /subscribe: Boolean\(scope\) && !onNotificationsPage/,
  );
  assert.match(sharedBell, /<Popover/);
  assert.match(sharedBell, /<AppSheet/);
  assert.doesNotMatch(sharedBell, /onLoadMore/);
  assert.match(sharedBell, /showFilterBar=\{false\}/);
  assert.doesNotMatch(bell, /IconBell data-icon="inline-start"/);
  assert.doesNotMatch(layout, /shift\/profile/);
});

test("operator install hint dismissal persists across navigation", () => {
  const operatorToolbar = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-pwa-toolbar.tsx",
  );
  const sharedToolbar = read("apps/web/app/components/pwa-toolbar.tsx");
  const containedLayout = sharedToolbar.slice(
    sharedToolbar.indexOf("// Contained (operator portal)."),
  );

  assert.match(
    operatorToolbar,
    /dismissStorageKey="matu-operator-install-dismissed"/,
  );
  assert.match(containedLayout, /onClick=\{handleDismiss\}/);
});

test("notifications page provides a safe branch return path", () => {
  const page = read("apps/web/app/(protected)/notifications/page.tsx");
  const client = read(
    "apps/web/app/(protected)/notifications/notifications-client.tsx",
  );

  assert.match(page, /getSafeInternalReturnTo/);
  assert.doesNotMatch(page, /\/br\/\$\{claims\.branch_id\}/);
  assert.match(page, /backHref=\{backHref\}/);
  assert.match(client, /messages\.notifications\.back/);
  assert.match(client, /\{backHref \? \(/);
});

test("operator home label is today, not an old branch title", () => {
  const labels = read("packages/shared/src/labels/vi.ts");

  assert.match(labels, /branchHome: "Hôm nay"/);
  assert.match(labels, /inventory: "Kho hàng"/);
  assert.match(labels, /branch_home: "Hôm nay"/);
  assert.match(labels, /operatorOpsActions: "Thiết lập"/);
  assert.match(labels, /branch_settings: "Thiết lập"/);
  assert.match(labels, /branchOperationsKds: "KDS"/);
  assert.doesNotMatch(labels, /branchHome: "Branch home"/);
  assert.doesNotMatch(labels, /Branch Runtime|Branch Ops/);
});

test("operator home keeps visible mobile identity while detail pages may compact", () => {
  const adapter = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const stock = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  const settings = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  const surface = read("apps/web/app/components/surface/app-page-header.tsx");

  assert.match(adapter, /hideHeaderOnMobile\?: boolean/);
  assert.match(adapter, /compactOnMobile=\{hideHeaderOnMobile\}/);
  assert.doesNotMatch(adapter, /sr-only sm:not-sr-only/);
  assert.match(adapter, /data-slot="branch-operator-page"/);
  assert.match(surface, /compactOnMobile\?: boolean/);
  assert.match(surface, /compactOnMobile && "max-sm:text-base"/);
  assert.match(surface, /compactOnMobile && "max-sm:hidden"/);
  // Page title stays in AppPageHeader — no duplicate mobile ControlBar title strip.
  assert.doesNotMatch(home, /hideHeaderOnMobile/);
  assert.doesNotMatch(stock, /hideHeaderOnMobile/);
  assert.doesNotMatch(settings, /hideHeaderOnMobile/);
  assert.doesNotMatch(
    home,
    /<BranchOperatorControlBar className="sm:hidden">/,
  );
  assert.doesNotMatch(
    stock,
    /<BranchOperatorControlBar className="sm:hidden">/,
  );
  assert.match(dashboard, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(dashboard, /hideHeaderOnMobile|BranchOperatorPage/);
});

test("operator home renders MODULE_ACL-backed capability tiles", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const homeContract = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_lib/operator-home-contract.ts",
  );

  assert.match(home, /resolveOperatorTiles/);
  assert.match(home, /BranchOperatorPage/);
  assert.match(home, /claims\.user_role !== "owner"/);
  const todaySource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-today-status.tsx",
  );
  const todayControlBar = todaySource.match(
    /<BranchOperatorControlBar[\s\S]*?<\/BranchOperatorControlBar>/,
  )?.[0];
  assert.match(todaySource, /BranchOperatorControlBar/);
  assert.match(todaySource, /getTodayWorkState/);
  assert.match(todaySource, /messages\.operator\.todayStatus/);
  assert.doesNotMatch(todaySource, /EmployeeHomePageContent/);
  assert.doesNotMatch(todaySource, /messages\.employee\.home/);
  assert.ok(todayControlBar, "today status must render a ControlBar");
  assert.doesNotMatch(todayControlBar, /size="touch"/);
  assert.match(home, /groups\.map/);
  assert.match(home, /BranchOperatorActionSection/);
  assert.match(home, /BranchOperatorPanel/);
  assert.match(home, /presentation="stations"/);
  assert.match(home, /presentation="plain"/);
  assert.match(home, /moduleKey === "pos"/);
  assert.match(home, /moduleKey === "kds"/);
  assert.match(home, /moduleKey === "pickup"/);
  assert.match(home, /claims\.user_role === "owner"/);
  assert.match(home, /resolveOperatorTileIcon/);
  assert.match(home, /getOperatorHomeTileHrefs/);
  assert.doesNotMatch(home, /BranchOperatorControlBar/);
  assert.match(home, /href: "\/"/);
  const managerHomeTiles = homeContract.match(
    /export const BRANCH_MANAGER_HOME_TILE_SUFFIXES = \[[\s\S]*?\] as const/,
  )?.[0];
  assert.ok(managerHomeTiles, "manager home tile suffixes must exist");
  assert.doesNotMatch(managerHomeTiles, /\/team"/);
  assert.doesNotMatch(managerHomeTiles, /\/menu-limits"/);
  assert.doesNotMatch(managerHomeTiles, /\/pickup"/);
  for (const suffix of ["/pos", "/kds"]) {
    assert.ok(homeContract.includes(`"${suffix}"`), suffix);
  }
  assert.match(homeContract, /BRANCH_FLOOR_HOME_TILE_SUFFIXES/);
  assert.match(homeContract, /return 4;/);
  assert.match(
    homeContract,
    /BRANCH_FLOOR_HOME_TILE_SUFFIXES[\s\S]*?"\/pickup"/,
  );
  assert.match(home, /BranchQuickMenuLimitTrigger/);
  const quickLimitSheet = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-quick-menu-limit-sheet.tsx",
  );
  assert.match(quickLimitSheet, /QuantityInput/);
  assert.match(quickLimitSheet, /handleSaveLimit/);
  assert.match(quickLimitSheet, /handleToggleDisabled/);
  assert.match(quickLimitSheet, /manualLimitShortLabel/);
  assert.match(quickLimitSheet, /menuLimitsTitle/);
  assert.match(quickLimitSheet, /max-h-dvh-80/);
  assert.match(quickLimitSheet, /min-h-12/);
  assert.doesNotMatch(quickLimitSheet, /max-h-\[85vh\]/);
  // Giới hạn bán shares the orders row — not a full-width strip above stations.
  assert.match(
    home,
    /grid grid-cols-2 gap-2[\s\S]*BranchQuickMenuLimitTrigger[\s\S]*branch_orders|BranchQuickMenuLimitTrigger[\s\S]*grid grid-cols-2/,
  );
  assert.doesNotMatch(
    home,
    /<BranchQueueSection[\s\S]*<BranchQuickMenuLimitTrigger[\s\S]*presentation="stations"/,
  );

  // R04: no curated central home on /br — daily hub is Control home `/`.
  assert.doesNotMatch(homeContract, /CENTRAL_HOME_TILE_SUFFIXES/);
  assert.match(home, /redirect\("\/"\)/);
  assert.match(home, /branchKind !== "branch"/);
  assert.match(
    home,
    /key: `\$\{group\.id\}-\$\{tile\.moduleKey\}-\$\{tile\.href\}`/,
  );
  assert.match(home, /mobileColumns=\{2\}/);
  assert.match(home, /<BranchQueueSection/);
  assert.match(home, /branchKind=\{branchKind\}/);
  assert.doesNotMatch(home, /branch-dashboard/);
  assert.doesNotMatch(home, /showOverview/);
  assert.doesNotMatch(home, /operatorRuntimeActions/);
  // Settings stays in overflow /settings — not a Landing tile (ui.md).
  assert.doesNotMatch(home, /operatorOpsActions/);
  assert.doesNotMatch(home, /branch-settings/);
  assert.doesNotMatch(home, /EmployeeStatusStrip/);
  assert.doesNotMatch(home, /operatorShortcutsStatus/);
  assert.doesNotMatch(home, /OPERATION_HANDOFFS/);
  assert.doesNotMatch(home, /NoteCallout/);
});

test("operator shift route keeps personal work in the Branch plane", () => {
  const shift = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  const leave = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/leave/page.tsx",
  );
  assert.match(shift, /redirect\(`\/br\/\$\{branchId\}\/team`\)/);
  assert.match(shift, /workflowLayout="stepper"/);
  assert.doesNotMatch(shift, /manager-dashboard|redirect\("\/me/);
  assert.match(leave, /routeBranchId=\{branchId\}/);
  assert.doesNotMatch(leave, /redirect\("\/me/);
});

test("operator stock count route renders the Branch count plane", () => {
  const stockCount = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx",
  );
  const countSurface = read("apps/web/lib/staff-runtime/count/page.tsx");

  assert.match(stockCount, /StaffCountPageContent/);
  assert.match(stockCount, /plane="branch"/);
  assert.doesNotMatch(stockCount, /EmployeeCountPageContent/);
  assert.match(countSurface, /BranchOperatorPage/);
  assert.match(countSurface, /BranchOperatorPanel/);
  assert.match(countSurface, /props\.plane === "branch"/);
});

test("branch home owns branch workflow entry tiles", () => {
  const navConfig = read("packages/shared/src/auth/nav-config.ts");
  const operatorTiles =
    navConfig.split("export const OPERATOR_TILE_ITEMS =")[1] ?? "";

  assert.match(navConfig, /my_shift: "Nhân sự"/);
  assert.match(navConfig, /approvals: "Duyệt"/);
  assert.match(navConfig, /sales_kitchen: "Bán hàng"/);
  assert.match(navConfig, /stock: "Kho hàng"/);
  assert.match(operatorTiles, /hrefTemplate: "\/me\/clock"/);
  assert.match(operatorTiles, /hrefTemplate: "\/me"/);
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/shift\/tasks"/,
  );
  // Manager shift approvals live on full shift routes; the Team hub tile remains.
  assert.match(operatorTiles, /hrefTemplate: "\/br\/\{branchId\}\/team"/);
  assert.doesNotMatch(
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
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer\?queue=receive"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer"/,
  );
  assert.match(operatorTiles, /label: "Giao nhận"/);
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/requests"/,
  );
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/receive"/,
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

test("branch management roots use Branch operator shell adapters", () => {
  const branchOperatorPage = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );

  assert.match(branchOperatorPage, /AppPageHeader/);
  assert.match(branchOperatorPage, /data-branch-operator-frame/);
  assert.match(branchOperatorPage, /"flex flex-col gap-2 lg:flex-row"/);
  assert.match(branchOperatorPage, /align === "end" && "lg:justify-end"/);
  assert.match(branchOperatorPage, /wideColumns &&/);
  assert.match(branchOperatorPage, /"xl:grid-cols-3 2xl:grid-cols-4"/);
  assert.match(branchOperatorPage, /items.length === 3 && "grid-cols-3"/);
  assert.match(branchOperatorPage, /items.length >= 4 && "grid-cols-2"/);
  assert.doesNotMatch(
    branchOperatorPage,
    /items.length >= 3 && "grid-cols-3"/,
  );
  assert.match(
    branchOperatorPage,
    /presentation === "stations" && itemCount === 2 && "grid grid-cols-2"/,
  );
  assert.match(
    branchOperatorPage,
    /presentation === "stations" && itemCount >= 3 && "grid grid-cols-3"/,
  );
  assert.match(branchOperatorPage, /active:scale-\[0\.97\]/);
  assert.match(branchOperatorPage, /"min-h-14 lg:items-center"/);
  assert.doesNotMatch(branchOperatorPage, /"flex flex-col gap-2 sm:flex-row"/);
  assert.doesNotMatch(
    branchOperatorPage,
    /columns === 2 && wideColumns && "lg:grid-cols-3 xl:grid-cols-4"/,
  );
  assert.doesNotMatch(
    branchOperatorPage,
    /active:scale-\[0\.97\] sm:items-center/,
  );
  assert.doesNotMatch(
    branchOperatorPage,
    /@lib\/staff-runtime\/components\/staff-runtime-page/,
  );
  assert.doesNotMatch(
    branchOperatorPage,
    /\bEmployee(?:Page|Panel|Frame|Action|Badge|Status|Detail|Inline|Control)/,
  );

  const dashboardShim = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  assert.match(dashboardShim, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(dashboardShim, /BranchOperatorPage/);

  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/page.tsx",
  ]) {
    const source = read(path);

    assert.match(source, /BranchOperatorPage/);
    assert.match(
      source,
      /@lib\/branch-operator\/components\/branch-operator-page/,
    );
    assert.doesNotMatch(source, /AppPageHeader/);
    assert.doesNotMatch(
      source,
      /@lib\/staff-runtime\/components\/staff-runtime-page/,
    );
    assert.doesNotMatch(source, /BranchManagementShell/);
    assert.doesNotMatch(source, /management-chrome/);
  }
});

test("operator home does not gate POS/KDS tiles on attendance clock-in", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.doesNotMatch(page, /tilesLockedBeforeClockIn/);
  assert.doesNotMatch(page, /lockedBeforeClockIn/);
  assert.doesNotMatch(
    page,
    /const workState = isFloorRole \? await getTodayWorkState\(\) : null/,
  );
});

test("operator home keeps KPI overview out of the Landing", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.equal(
    exists(
      "apps/web/app/(protected)/br/[branchId]/(operator)/_components/landing/landing-overview-section.tsx",
    ),
    false,
  );
  assert.doesNotMatch(home, /KpiCard|fetchBranchDayStatus/);
});

test("branch dashboard redirects into Hôm nay instead of mounting a command surface", () => {
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  const tools = read("packages/shared/src/auth/nav-config.ts");

  assert.match(dashboard, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(
    dashboard,
    /BranchOperatorPage|tileGroups\.liveOperations|BranchReadinessList/,
  );
  assert.match(tools, /hrefTemplate: "\/br\/\{branchId\}\/pos-sessions"/);
  assert.match(tools, /hrefTemplate: "\/br\/\{branchId\}\/pickup"/);
  assert.match(tools, /hrefTemplate: "\/br\/\{branchId\}\/close-day"/);
  assert.equal(
    exists(
      "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_lib/command-config.tsx",
    ),
    false,
  );
});

test("branch settings landing is the Công cụ hub with setup as one section", () => {
  const settingsHub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  const settingsLinks = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/_lib/settings-links.ts",
  );
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  assert.match(settingsHub, /<BranchOperatorPage/);
  assert.match(settingsHub, /BranchOperatorActionSection/);
  assert.match(settingsHub, /resolveBranchToolsGroups/);
  assert.match(settingsHub, /canAccess\(role, link\.moduleKey\)/);
  assert.match(settingsHub, /canManageTenantStrategySettings\(role\)/);
  assert.match(settingsHub, /settings\/network/);
  assert.doesNotMatch(settingsHub, /columns=\{1\}/);
  assert.doesNotMatch(
    settingsHub,
    /AppLinkCard|LinkCardGrid|KpiRow|KpiCard|BranchManagementShell|AppPageHeader/,
  );
  assert.doesNotMatch(settingsHub, /href:\s*"\/"/);

  const tableIndex = settingsLinks.indexOf("settings/tables");
  const posIndex = settingsLinks.indexOf("settings/pos");
  const kdsIndex = settingsLinks.indexOf("settings/kds");
  const printersIndex = settingsLinks.indexOf("settings/printers");
  assert.ok(tableIndex >= 0, "tables tile exists");
  assert.ok(posIndex > tableIndex, "POS setup follows tables");
  assert.ok(kdsIndex > posIndex, "KDS setup follows POS");
  assert.ok(printersIndex > kdsIndex, "printers setup follows KDS");
  assert.doesNotMatch(
    settingsLinks,
    /settings\/network/,
    "network tile is owner-gated on the landing page, not shared setup links",
  );
  assert.doesNotMatch(
    settingsLinks,
    /branch_dashboard|branch_pos_sessions|moduleKey: "hr"|\/hr/,
  );

  assert.match(settingsMessages, /landingTitle: "Công cụ"/);
  assert.match(settingsMessages, /setupSectionTitle: "Thiết lập cửa hàng"/);
  assert.match(
    settingsMessages,
    /landingDescription: \(_branchName: string\) => ""/,
  );
  assert.match(settingsMessages, /posSetupTitle: "Đăng ký POS"/);
  assert.doesNotMatch(
    settingsMessages,
    /attendanceChecklistDescription:\s*"Checklist template và phân công công việc/,
  );
});

test("branch settings detail routes stay inside the Branch operator plane", () => {
  const detailPages = [
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/tables/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/kds/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/printers/page.tsx",
  ] as const;

  for (const path of detailPages) {
    const source = read(path);

    assert.match(
      source,
      /@lib\/branch-operator\/components\/branch-operator-page/,
    );
    assert.match(source, /<BranchOperatorPage/);
    assert.match(source, /<BranchOperatorPanel/);
    assert.match(source, /canManageBranchFloorSettings\(claims\.user_role\)/);
    assert.match(source, /redirect\(`\/br\/\$\{branchId\}\/settings`\)/);
    assert.doesNotMatch(
      source,
      /<AppPage\b|AppPageHeader|BranchManagementShell|OwnerModuleShell|ControlSurfaceShell|ManagementShell|KpiCard/,
      path,
    );
  }

  const networkPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/network/page.tsx",
  );
  assert.match(
    networkPage,
    /@lib\/branch-operator\/components\/branch-operator-page/,
  );
  assert.match(networkPage, /<BranchOperatorPage/);
  assert.match(networkPage, /<BranchOperatorPanel/);
  assert.match(
    networkPage,
    /canManageTenantStrategySettings\(claims\.user_role\)/,
  );
  assert.match(networkPage, /NetworkConfigPanel/);
  assert.match(networkPage, /redirect\(`\/br\/\$\{branchId\}\/settings`\)/);
  assert.doesNotMatch(
    networkPage,
    /<AppPage\b|AppPageHeader|BranchManagementShell|OwnerModuleShell|ControlSurfaceShell|ManagementShell|KpiCard/,
  );

  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx",
    ),
    /messages\.settings\.branch\.posSetupDescription/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx",
    ),
    /<TerminalsClient[\s\S]*embedded/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx",
    ),
    /<StockControlCard[\s\S]*embedded/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/_shared/settings/pos/stock-control-card.tsx",
    ),
    /if \(embedded\) return content/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/kds/page.tsx",
    ),
    /messages\.settings\.branch\.kdsSetupDescription/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/kds/page.tsx",
    ),
    /<StationsClient[\s\S]*embedded/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/tables/page.tsx",
    ),
    /messages\.settings\.branch\.tablesDescription/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/tables/page.tsx",
    ),
    /<TablesClient[\s\S]*embedded/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/settings/printers/page.tsx",
    ),
    /messages\.settings\.branch\.printersDescription/,
  );

  const printersClient = read(
    "apps/web/app/(protected)/br/_shared/settings/printers/printers-client.tsx",
  );
  assert.match(printersClient, /<Item[\s\S]*variant="outline"/);
  assert.doesNotMatch(printersClient, /bg-card p-3/);

  const kdsStationForm = read(
    "apps/web/app/(protected)/br/_shared/settings/kds/station-form-dialog.tsx",
  );
  assert.match(kdsStationForm, /@comtammatu\/ui\/components\/frame/);
  assert.match(kdsStationForm, /<Frame[\s\S]*max-h-48/);
  assert.doesNotMatch(kdsStationForm, /rounded-md border p-3/);

  const posSessionsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  assert.match(posSessionsClient, /BranchOperatorFrame/);
  assert.match(posSessionsClient, /grid gap-2 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4/);
  assert.match(posSessionsClient, /grid gap-2 lg:grid-cols-2/);
});

test("operator home renders the unified Cần duyệt queue before domain tile rows", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  const queueSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-queue-section.tsx",
  );

  assert.match(queueSource, /fetchBranchQueueCounts/);
  assert.match(queueSource, /queueRows\.length === 0/);
  assert.match(queueSource, /\.filter\(\s*\(row\) => row\.count > 0/);
  assert.doesNotMatch(queueSource, /variant=\{badgeVariant\}/);
  assert.match(queueSource, /branchCopy\.queueTitle/);

  assert.ok(
    home.indexOf("<BranchQueueSection") < home.indexOf("groups.map"),
    "Landing queue should render before domain tile rows",
  );
});

test("operator today shift and profile screens use responsive branch layout", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const employeeHome = read("apps/web/lib/staff-runtime/page.tsx");
  const profile = read("apps/web/lib/staff-runtime/profile/page.tsx");
  const profileActions = read(
    "apps/web/lib/staff-runtime/profile/profile-actions.tsx",
  );
  const operatorProfile = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/profile/page.tsx",
  );
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  assert.match(layout, /md:max-w-2xl lg:max-w-4xl/);
  assert.doesNotMatch(layout, /md:max-w-5xl/);
  assert.doesNotMatch(layout, /\s+mobile\s+contentClassName=/);
  assert.match(bottomNav, /position="static"/);
  assert.match(bottomNav, /hideOnDesktop=\{false\}/);
  assert.doesNotMatch(
    home,
    /<BranchOperatorPage[\s\S]*?<div className="flex flex-col gap-3"[\s\S]*?<\/BranchOperatorPage>/,
  );
  assert.doesNotMatch(home, /md:flex-row/);
  assert.doesNotMatch(home, /md:w-72 lg:w-80 xl:w-96/);
  assert.match(employeeHome, /workflowLayout === "stepper"/);
  assert.match(employeeHome, /lg:grid-cols-5/);
  assert.match(operatorProfile, /StaffProfilePageContent plane="branch"/);
  assert.doesNotMatch(operatorProfile, /PERSONAL_LINKS/);
  assert.doesNotMatch(operatorProfile, /permissions/);
  assert.doesNotMatch(operatorProfile, /showWorkspaceLinks/);
  assert.doesNotMatch(profile, /showWorkspaceLinks/);
  assert.doesNotMatch(profile, /resolveQuickLaunchGroups/);
  assert.doesNotMatch(profile, /EmployeeActionSection/);
  assert.doesNotMatch(profile, /EmployeeHomePageContent/);
  assert.doesNotMatch(profile, /attendance_records/);
  assert.doesNotMatch(profile, /bank_account/);
  assert.match(profile, /<BranchOperatorPanel tone="info">/);
  assert.match(
    profile,
    /flex flex-col items-center gap-3 text-center sm:flex-row/,
  );
  assert.match(profile, /<Avatar className="size-full">/);
  assert.match(profile, /AvatarFallback className="text-3xl font-semibold"/);
  assert.match(profile, /copy\.employeeCode/);
  assert.match(profile, /<BranchOperatorDetailList[\s\S]*columns=\{2\}/);
  assert.match(profile, /IconBirthDate/);
  assert.match(profile, /formatBirthDate\(birthDate\)/);
  assert.match(profile, /copy\.birthDate/);
  assert.match(profile, /copy\.noBirthDate/);
  assert.match(profile, /aria-label=\{`\$\{copy\.phone\}: \$\{phone\}`\}/);
  assert.match(profile, /aria-label=\{`\$\{copy\.email\}: \$\{email\}`\}/);
  assert.match(
    profile,
    /aria-label=\{`\$\{copy\.birthDate\}: \$\{birthDateDisplay\}`\}/,
  );
  assert.doesNotMatch(
    profile,
    /<span className="shrink-0(?: text-muted-foreground)?">\s*\{copy\.(?:phone|email|birthDate)\}:\s*<\/span>/,
  );
  assert.doesNotMatch(profile, /new Date/);
  assert.doesNotMatch(profile, /EmployeeDetailList/);
  assert.doesNotMatch(profile, /EmployeeStatusStrip/);
  assert.doesNotMatch(profile, /useIsMobile/);
  assert.match(profile, /ProfileEditAction/);
  assert.match(profile, /ProfileAvatarAction/);
  assert.doesNotMatch(profile, /profile-edit-dialog/);
  assert.doesNotMatch(profile, /profile-avatar-upload/);
  assert.match(profileActions, /dynamic<ProfileEditActionProps>/);
  assert.match(profileActions, /dynamic<ProfileAvatarActionProps>/);
  assert.match(profileActions, /import\("\.\/profile-edit-dialog"\)/);
  assert.match(profileActions, /import\("\.\/profile-avatar-upload"\)/);
  assert.match(profileActions, /ssr: false/);
  assert.match(profile, /buttonSize="touch"/);
  assert.match(profile, /buttonVariant="default"/);
  assert.match(profile, /buttonVariant="outline"/);
  assert.match(profile, /triggerLabel=\{copy\.editProfileShort\}/);
  assert.match(profileActions, /buttonVariant\?: ProfileButtonVariant/);
  assert.doesNotMatch(profile, /grid grid-cols-2 gap-2/);
  assert.doesNotMatch(profile, /sm:min-w-40/);
  assert.doesNotMatch(profile, /grid gap-2 text-sm sm:grid-cols-2/);
  assert.doesNotMatch(profile, /col-start-2 row-start-2/);
  assert.doesNotMatch(profile, /start_date/);
  assert.doesNotMatch(profile, /copy\.startDate/);
  assert.match(
    profile,
    /profiles"\)\s*\.select\("full_name, phone, avatar_url, birth_date"\)/,
  );
  assert.match(profile, /birthDate: birthDate \?\? ""/);
  assert.match(profile, /BranchOperatorDetailList/);
  assert.match(profile, /label: copy\.birthDate/);
  assert.match(profile, /columns=\{2\}/);
});

test("employee profile self-service update uses the scoped profile RPC", () => {
  const action = read("apps/web/lib/staff-runtime/profile/actions.ts");
  const dialog = read(
    "apps/web/lib/staff-runtime/profile/profile-edit-dialog.tsx",
  );
  const upload = read(
    "apps/web/lib/staff-runtime/profile/profile-avatar-upload.tsx",
  );
  const copy = read("apps/web/lib/messages/employee.ts");
  const migration = read(
    "supabase/migration-archive/20260707165303_add_profile_birth_date.sql",
  );

  assert.match(action, /z\.object/);
  assert.match(action, /profileSchema\.safeParse/);
  assert.match(action, /supabase\.rpc\("update_my_profile"/);
  assert.match(action, /p_full_name: fullName/);
  assert.match(action, /p_phone: phone/);
  assert.match(action, /p_birth_date: birthDate/);
  assert.match(action, /getVNDateString/);
  assert.match(action, /uploadMyAvatar/);
  assert.match(action, /createServiceClient/);
  assert.match(action, /storage\s*\.from\(PROFILE_AVATAR_BUCKET\)\s*\.upload/);
  assert.match(action, /p_avatar_url: publicUrl/);
  assert.match(action, /Không thể cập nhật hồ sơ/);
  assert.doesNotMatch(action, /error\.message/);
  assert.match(dialog, /FormDialog/);
  assert.match(dialog, /TextField/);
  assert.match(dialog, /BusinessDateField/);
  assert.match(dialog, /name="birthDate"/);
  assert.match(dialog, /autoComplete="name"/);
  assert.match(dialog, /type="tel"/);
  assert.match(dialog, /autoComplete="tel"/);
  assert.doesNotMatch(dialog, /avatarUrl/);
  assert.doesNotMatch(dialog, /https:\/\/\.\.\./);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.match(dialog, /toast\.success\(copy\.savedProfile\)/);
  assert.match(upload, /type="file"/);
  assert.match(upload, /accept=\{AVATAR_ACCEPT\}/);
  assert.match(upload, /createImageBitmap/);
  assert.match(upload, /uploadMyAvatar\(formData\)/);
  assert.doesNotMatch(upload, /type="url"/);
  assert.match(copy, /uploadAvatar: "Đổi ảnh"/);
  assert.match(copy, /birthDate: "Ngày sinh"/);
  assert.match(copy, /profileShort: "Hồ sơ"/);
  assert.match(copy, /title: "Hồ sơ"/);
  assert.doesNotMatch(copy, /Hồ sơ cá nhân, ca hôm nay và công lương/);
  assert.doesNotMatch(copy, /URL ảnh đại diện/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS birth_date date/);
  assert.match(migration, /p_birth_date date DEFAULT NULL::date/);
});

test("manager smart card counts pending waste approvals with checkouts", () => {
  const home = read("apps/web/lib/staff-runtime/page.tsx");

  assert.match(home, /\.eq\("issue_type", "writeoff"\)/);
  assert.match(home, /\.eq\("approval_status", "pending"\)/);
  assert.match(home, /INVENTORY_WASTE_APPROVE/);
  assert.match(home, /pendingCheckouts \+ pendingWaste/);
});

test("manager shift dashboard keeps the self attendance card", () => {
  const home = read("apps/web/lib/staff-runtime/page.tsx");

  assert.match(
    home,
    /mode === "manager-dashboard"[\s\S]*\{todayCard\}[\s\S]*\{managerActionPanel\}/,
  );
});
