import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

function pgDumpBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing pg_dump block: ${marker}`);
  const next = source.indexOf("\n\n--\n-- Name:", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

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

test("operator bottom nav keeps daily jobs and profile within thumb reach", () => {
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  for (const expected of ["`/br/${branchId}`", "`/br/${branchId}/shift`"]) {
    assert.ok(bottomNav.includes(expected), expected);
  }
  assert.doesNotMatch(bottomNav, /shift\/profile/);
  assert.doesNotMatch(bottomNav, /shift\/leave/);
  assert.doesNotMatch(bottomNav, /shift\/payslip/);
  assert.doesNotMatch(bottomNav, /shift\/schedule/);
  assert.ok(bottomNav.includes("showBranchManagement"));
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/team`/);
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/stock`/);
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/dashboard`/);
  assert.doesNotMatch(bottomNav, /label: APP_COPY_VI\.operations/);
  assert.doesNotMatch(bottomNav, /icon: LayoutDashboard/);
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/settings`/);
  assert.doesNotMatch(bottomNav, /`\/br\/\$\{branchId\}\/more`/);
  assert.equal(
    exists("apps/web/app/(protected)/br/[branchId]/(operator)/more/page.tsx"),
    false,
  );
  assert.doesNotMatch(bottomNav, /branchManagementOverflowPrefixes/);
  assert.doesNotMatch(bottomNav, /Ellipsis/);
  assert.match(bottomNav, /`\/br\/\$\{branchId\}\/profile`/);
  assert.match(bottomNav, /label: messages\.operator\.nav\.profileShort/);
  assert.doesNotMatch(bottomNav, /label: messages\.operator\.nav\.schedule/);
  assert.doesNotMatch(bottomNav, /messages\.employee\.nav/);
  assert.match(bottomNav, /icon: User\b/);
  assert.doesNotMatch(bottomNav, /"\/notifications"/);
  assert.doesNotMatch(bottomNav, /MAX_VISIBLE_ITEMS/);
  assert.match(settingsMessages, /centralNavStock: "Kho"/);
  assert.match(
    layout,
    /const canUseShiftTab =\s*claims\.user_role !== "owner"/,
  );
  assert.match(layout, /showEmployeeLinks=\{canUseShiftTab\}/);
});

test("operator header shows branch context and keeps high-signal actions", () => {
  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  const appHeader = read("apps/web/app/components/app-header.tsx");

  assert.match(layout, /homeHref=\{`\/br\/\$\{context\.branchId\}`\}/);
  assert.match(layout, /homeAriaLabel=\{APP_COPY_VI\.operatorHome\}/);
  assert.match(layout, /subtitle=\{ROLE_LABEL_VI\[claims\.user_role\]\}/);
  assert.match(layout, /subtitleHiddenOnMobile/);
  assert.match(layout, /\swide\s/);
  assert.doesNotMatch(layout, /showBrandText=\{false\}/);
  assert.match(layout, /context\.branch\.name\.replace\(\/\^Chi nhánh\\s\+\//);
  assert.match(layout, /className="sm:hidden"/);
  assert.match(layout, /className="hidden sm:inline"/);
  assert.doesNotMatch(layout, /Hub \$\{hubLabel\}/);
  assert.match(appHeader, /homeHref\?: string/);
  assert.match(appHeader, /<Link[\s\S]*href=\{href\}/);
  assert.match(appHeader, /href && "min-h-11"/);
  assert.match(appHeader, /"min-h-11 min-w-11 shrink-0 justify-center"/);
  assert.doesNotMatch(layout, /IconLayoutDashboard/);
  assert.doesNotMatch(layout, /\/dashboard|APP_COPY_VI\.branchCommand/);
  assert.doesNotMatch(layout, /IconUser/);
  assert.doesNotMatch(
    layout,
    /href=\{`\/br\/\$\{context\.branchId\}\/profile`\}/,
  );
  assert.match(
    layout,
    /aria-label=\{messages\.operator\.header\.notificationsAria\}/,
  );
  assert.doesNotMatch(layout, /messages\.employee\.(?:nav|header)/);
  assert.match(layout, /notificationsHref/);
  assert.match(layout, /const unreadPromise = getUnreadCount\(\)\.catch/);
  assert.match(layout, /const unreadResult = await unreadPromise/);
  assert.match(layout, /encodeURIComponent\(`\/br\/\$\{context\.branchId\}`\)/);
  assert.match(layout, /href=\{notificationsHref\}/);
  assert.match(layout, /size="icon-touch"/);
  assert.match(layout, /className="min-w-11"/);
  assert.match(layout, /className="hidden sm:inline"/);
  assert.doesNotMatch(layout, /IconBell data-icon="inline-start"/);
  assert.doesNotMatch(layout, /<Badge/);
  assert.doesNotMatch(layout, /shift\/profile/);
});

test("operator install hint stays on Home and dismissal persists", () => {
  const operatorToolbar = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-pwa-toolbar.tsx",
  );
  const sharedToolbar = read("apps/web/app/components/pwa-toolbar.tsx");
  const containedLayout = sharedToolbar.slice(
    sharedToolbar.indexOf("// Contained (Employee)."),
  );

  assert.match(
    operatorToolbar,
    /dismissStorageKey="matu-operator-install-dismissed"/,
  );
  assert.match(operatorToolbar, /const isOnline = useIsOnline\(\)/);
  assert.match(operatorToolbar, /const isOperatorHome = \/\^\\\/br/);
  assert.match(
    operatorToolbar,
    /if \(isOnline && !isOperatorHome\) return null/,
  );
  assert.equal(
    (
      sharedToolbar.match(
        /size="icon-touch"\s+className="shrink-0 text-muted-foreground"\s+onClick=\{handleDismiss\}\s+aria-label=\{copy\.dismissLabel\}/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(containedLayout, /onClick=\{handleDismiss\}/);
  assert.doesNotMatch(
    containedLayout,
    /onClick=\{\(\) => setInstallDismissed\(true\)\}/,
  );
});

test("notifications page provides a safe branch return path", () => {
  const page = read("apps/web/app/(protected)/notifications/page.tsx");

  assert.match(page, /getSafeInternalReturnTo/);
  assert.match(page, /\/br\/\$\{claims\.branch_id\}/);
  assert.match(page, /messages\.notifications\.back/);
});

test("operator home label is today, not an old branch title", () => {
  const labels = read("packages/shared/src/labels/vi.ts");

  assert.match(labels, /operatorHome: "Nay"/);
  assert.match(labels, /operator_home: "Nay"/);
  assert.doesNotMatch(labels, /operatorHome: "Branch Hub"/);
  assert.doesNotMatch(labels, /Branch Runtime|Branch Ops/);
});

test("operator pages keep one shared back contract and Branch catalog stays retired", () => {
  const adapter = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const stock = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );

  assert.match(adapter, /hideHeaderOnMobile\?: boolean/);
  assert.match(adapter, /sr-only sm:not-sr-only/);
  assert.match(adapter, /data-slot="branch-operator-page"/);
  assert.match(adapter, /backHref\?: string/);
  assert.match(
    adapter,
    /<AppBackLink href=\{backHref\} onClick=\{backOnClick\}>/,
  );
  assert.doesNotMatch(home, /hideHeaderOnMobile/);
  assert.doesNotMatch(stock, /hideHeaderOnMobile/);
  assert.equal(
    exists(
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/catalog/page.tsx",
    ),
    false,
  );
});

test("operator touch rows use explicit semantic activation", () => {
  const menuLimits = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-table.tsx",
  );
  const posSessions = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );

  assert.doesNotMatch(menuLimits, /useSwipeReveal|useLongPress|onPointerDown/);
  assert.match(menuLimits, /<button type="button" onClick=\{onOpenDrawer\}/);
  assert.match(
    posSessions,
    /<button[\s\S]*type="button"[\s\S]*setSelectedOrderId/,
  );
});

test("operator home keeps MODULE_ACL-backed capabilities in one tools menu", () => {
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
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-today-status.tsx",
  );
  assert.match(todaySource, /BranchOperatorControlBar/);
  assert.match(todaySource, /getTodayWorkState/);
  assert.match(todaySource, /messages\.operator\.todayStatus/);
  assert.doesNotMatch(todaySource, /EmployeeHomePageContent/);
  assert.doesNotMatch(todaySource, /messages\.employee\.home/);
  assert.match(home, /groups\.map/);
  assert.match(home, /DropdownMenu/);
  assert.match(home, /const toolGroups =/);
  assert.doesNotMatch(home, /BranchOperatorActionSection/);
  assert.doesNotMatch(home, /presentation="stations"|stationDescriptions/);
  assert.match(home, /resolveOperatorTileIcon/);
  assert.match(home, /getBranchPrimaryHomeGroup/);
  assert.doesNotMatch(home, /BranchOperatorControlBar|LayoutDashboard/);
  assert.doesNotMatch(homeContract, /"\/team"/);
  for (const suffix of ["/pos", "/kds", "/runner", "/menu-limits"]) {
    assert.ok(homeContract.includes(`"${suffix}"`), suffix);
  }
  assert.match(
    home,
    /key: `\$\{group\.id\}-\$\{tile\.moduleKey\}-\$\{tile\.href\}`/,
  );
  assert.match(home, /homeCopy\.toolsMenu/);
  assert.match(home, /<HubQueueSection/);
  assert.doesNotMatch(home, /branch-dashboard/);
  assert.doesNotMatch(home, /showOverview/);
  assert.doesNotMatch(home, /HubOverviewSection/);
  assert.doesNotMatch(home, /operatorRuntimeActions/);
  assert.match(home, /operatorOpsActions/);
  assert.doesNotMatch(home, /EmployeeStatusStrip/);
  assert.doesNotMatch(home, /operatorShortcutsStatus/);
  assert.doesNotMatch(home, /OPERATION_HANDOFFS/);
  assert.doesNotMatch(home, /NoteCallout/);
});

test("operator shift route renders the Branch workday plane", () => {
  const shift = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  const leave = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/leave/page.tsx",
  );
  const workday = read("apps/web/lib/staff-runtime/page.tsx");
  const countClient = read("apps/web/lib/staff-runtime/count/count-client.tsx");
  const leaveSurface = read("apps/web/lib/staff-runtime/leave/page.tsx");
  const leaveClient = read("apps/web/lib/staff-runtime/leave/leave-client.tsx");
  const operatorCopy = read("apps/web/lib/messages/operator.ts");

  assert.match(shift, /StaffWorkdayPageContent/);
  assert.match(shift, /plane="branch"/);
  assert.match(shift, /copy=\{messages\.operator\.shift\}/);
  assert.match(shift, /tasksCopy=\{messages\.operator\.shiftTasks\}/);
  assert.doesNotMatch(shift, /EmployeeHomePageContent/);
  assert.doesNotMatch(shift, /messages\.employee\.home/);
  assert.match(workday, /BranchOperatorPage as BranchOperatorPageShell/);
  assert.match(workday, /plane === "branch"/);
  assert.match(workday, /StaffCountPanelContent/);
  assert.match(workday, /plane=\{plane\}/);
  assert.match(countClient, /BranchOperatorPanel/);
  assert.match(countClient, /BRANCH_COUNT_PRIMITIVES/);
  assert.match(countClient, /plane === "branch"/);
  assert.match(leave, /EmployeeLeavePageContent/);
  assert.match(leave, /plane="branch"/);
  assert.match(leaveSurface, /BranchOperatorPage/);
  assert.match(leaveSurface, /plane === "branch"/);
  assert.doesNotMatch(
    leaveClient,
    /EmployeePanel|BranchOperatorPanel|StatusStrip|ActionBar/,
  );
  assert.match(leaveClient, /size="icon-touch"/);
  assert.doesNotMatch(
    leaveClient,
    /request\.reason \? ` · \$\{request\.reason\}`/,
  );
  assert.match(operatorCopy, /shift: \{/);
  assert.match(operatorCopy, /shiftTasks: \{/);
});

test("operator shift count route renders the Branch count plane", () => {
  const stockCountAlias = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count/page.tsx",
  );
  const shiftCount = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/count/page.tsx",
  );
  const countSurface = read("apps/web/lib/staff-runtime/count/page.tsx");

  assert.match(
    stockCountAlias,
    /redirect\(`\/br\/\$\{branchId\}\/shift\/count/,
  );
  assert.match(shiftCount, /StaffCountPageContent/);
  assert.match(shiftCount, /plane="branch"/);
  assert.doesNotMatch(shiftCount, /EmployeeCountPageContent/);
  assert.match(countSurface, /BranchOperatorPage/);
  assert.match(countSurface, /BranchOperatorPanel/);
  assert.match(countSurface, /props\.plane === "branch"/);
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
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/transfer\?queue=receive"/,
  );
  assert.doesNotMatch(
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
  assert.doesNotMatch(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/waste"/,
  );
  assert.match(
    operatorTiles,
    /hrefTemplate: "\/br\/\{branchId\}\/stock\/count-assignments"/,
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
  assert.match(
    branchOperatorPage,
    /presentation === "stations" && "grid grid-cols-1 sm:grid-cols-3"/,
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

  assert.match(
    read(
      "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
    ),
    /redirect\(`\/br\/\$\{branchId\}`\)/,
  );
});

test("pre-clock-in gate disables floor tiles instead of hiding them", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.match(
    page,
    /tilesLockedBeforeClockIn && group\.id === "sales_kitchen"/,
  );
  assert.doesNotMatch(page, /tiles: \[\]/);
});

test("operator home keeps KPI overview out of the Hub", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  assert.equal(
    exists(
      "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-overview-section.tsx",
    ),
    false,
  );
  assert.doesNotMatch(home, /KpiCard|HubOverview|fetchBranchDayStatus/);
});

test("branch dashboard is a compatibility alias for the single command home", () => {
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const settings = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );

  assert.match(dashboard, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(home, /HubReadinessSection/);
  assert.doesNotMatch(settings, /HubReadinessSection/);
  assert.doesNotMatch(dashboard, /KpiRow|KpiCard|tileGroups/);
});

test("branch settings hub stays a setup-only Branch operator surface", () => {
  const settingsHub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  const hubTiles = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/_lib/hub-tiles.ts",
  );
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  assert.match(settingsHub, /<BranchOperatorPage/);
  assert.match(settingsHub, /BranchOperatorActionSection/);
  assert.match(settingsHub, /presentation="plain"/);
  assert.match(settingsHub, /columns=\{1\}/);
  assert.match(settingsHub, /tiles\.map/);
  assert.doesNotMatch(
    settingsHub,
    /HubReadinessSection|visibleTiles|canAccess\(|AppEmptyState/,
  );
  assert.doesNotMatch(
    settingsHub,
    /AppLinkCard|LinkCardGrid|KpiRow|KpiCard|BranchManagementShell|AppPageHeader/,
  );
  assert.doesNotMatch(settingsHub, /pos-sessions|menu-limits|\/hr|Attendance/);

  const tableIndex = hubTiles.indexOf("settings/tables");
  const posIndex = hubTiles.indexOf("settings/pos");
  const kdsIndex = hubTiles.indexOf("settings/kds");
  const printersIndex = hubTiles.indexOf("settings/printers");
  assert.ok(tableIndex >= 0, "tables tile exists");
  assert.ok(posIndex > tableIndex, "POS setup follows tables");
  assert.ok(kdsIndex > posIndex, "KDS setup follows POS");
  assert.ok(printersIndex > kdsIndex, "printers setup follows KDS");
  assert.doesNotMatch(hubTiles, /moduleKey|branch_dashboard|\/hr/);

  assert.match(settingsMessages, /hubTitle: "Thiết lập vận hành chi nhánh"/);
  assert.match(settingsMessages, /hubDescription: "Bàn, POS, bếp và in"/);
  assert.match(settingsMessages, /posSetupTitle: "Máy POS"/);
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
    if (path.endsWith("/printers/page.tsx")) {
      assert.match(source, /<PrintersClient[\s\S]*branch=\{branchRes\.data\}/);
      assert.match(source, /readinessPrinterOnlineBadge/);
      assert.doesNotMatch(source, /<BranchOperatorPanel/);
    }
    if (path.endsWith("/tables/page.tsx") || path.endsWith("/kds/page.tsx")) {
      assert.doesNotMatch(source, /<BranchOperatorPanel/);
    }
    assert.match(source, /canManageBranchFloorSettings\(claims\.user_role\)/);
    assert.match(source, /redirect\(`\/br\/\$\{branchId\}\/settings`\)/);
    assert.match(source, /\.eq\("branch_kind", "branch"\)/);
    assert.match(
      source,
      /backLabel=\{messages\.settings\.branch\.settingsBack\}/,
    );
    assert.doesNotMatch(
      source,
      /<AppPage\b|AppPageHeader|BranchManagementShell|AdminDashboardModuleShell|ManagementShell|KpiCard/,
      path,
    );
  }

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
    /claims\.user_role === "owner"[\s\S]*<StockControlCard[\s\S]*embedded/,
  );
  assert.match(
    read(
      "apps/web/app/(protected)/branch-settings/_shared/pos/stock-control-card.tsx",
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
    /messages\.settings\.tables\.tableListDescription[\s\S]*messages\.settings\.tables\.zonesDescription/,
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
    "apps/web/app/(protected)/branch-settings/_shared/printers/printers-client.tsx",
  );
  assert.match(printersClient, /<Item[\s\S]*variant="outline"/);
  assert.match(printersClient, /<SheetContent/);
  assert.match(printersClient, /"connection" \| "routing"/);
  assert.doesNotMatch(printersClient, /AppSection|AppDialog/);
  assert.doesNotMatch(printersClient, /bg-card p-3/);

  const kdsStationForm = read(
    "apps/web/app/(protected)/branch-settings/_shared/kds/station-form-dialog.tsx",
  );
  assert.match(kdsStationForm, /@comtammatu\/ui\/components\/frame/);
  assert.match(kdsStationForm, /<Frame[\s\S]*max-h-48/);
  assert.doesNotMatch(kdsStationForm, /rounded-md border p-3/);

  const posSessionsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  assert.match(posSessionsClient, /BranchOperatorFrame/);
  assert.doesNotMatch(posSessionsClient, /rounded-md border/);
  assert.match(posSessionsClient, /PosSessionsListClient/);
  assert.match(posSessionsClient, /PosSessionDetailClient/);
  assert.match(posSessionsClient, /grid grid-cols-2 gap-2/);
  assert.doesNotMatch(posSessionsClient, /SessionReportCard|onCloseShift/);
  assert.doesNotMatch(
    posSessionsClient,
    /grid gap-[23] (?:text-sm )?sm:grid-cols-[23]/,
  );
});

test("operator home keeps the active queue in the body and capability links in the tools menu", () => {
  const home = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );

  const queueSource = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-queue-section.tsx",
  );

  assert.match(queueSource, /fetchBranchQueueCounts/);
  assert.match(queueSource, /queueRows\.length === 0/);
  assert.match(queueSource, /\.filter\(\s*\(row\) => row\.count > 0/);
  assert.doesNotMatch(queueSource, /variant=\{badgeVariant\}/);
  assert.match(queueSource, /branchCopy\.queueTitle/);

  assert.match(home, /action=\{[\s\S]*<DropdownMenu>/);
  assert.match(home, /<HubQueueSection/);
  assert.doesNotMatch(home, /BranchOperatorActionSection/);
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

  assert.match(layout, /md:max-w-2xl lg:max-w-5xl xl:max-w-6xl/);
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
  assert.match(operatorProfile, /StaffProfilePageContent/);
  assert.match(operatorProfile, /plane="branch"/);
  assert.doesNotMatch(operatorProfile, /PERSONAL_LINKS/);
  assert.doesNotMatch(operatorProfile, /permissions/);
  assert.doesNotMatch(operatorProfile, /showWorkspaceLinks/);
  assert.doesNotMatch(profile, /showWorkspaceLinks/);
  assert.doesNotMatch(profile, /attendance_records/);
  assert.doesNotMatch(profile, /bank_account/);
  assert.match(profile, /<EmployeePanel tone="info" size="sm">/);
  assert.match(profile, /<div className="grid gap-4">/);
  assert.match(profile, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(profile, /group\/avatar-upload/);
  assert.match(profile, /relative row-span-2 size-28 shrink-0/);
  assert.match(profile, /sm:size-32/);
  assert.match(profile, /<Avatar className="size-full min-h-full min-w-full">/);
  assert.doesNotMatch(profile, /<Avatar\s+size="lg"/);
  assert.match(profile, /AvatarFallback className="text-3xl font-semibold"/);
  assert.match(profile, /absolute inset-0 z-10/);
  assert.match(profile, /pointer-events-none absolute inset-0 z-10/);
  assert.match(
    profile,
    /bg-foreground\/50 p-0 text-background opacity-0 transition-opacity/,
  );
  assert.match(profile, /has-data-\[icon=inline-start\]:pl-0/);
  assert.match(profile, /has-data-\[icon=inline-end\]:pr-0/);
  assert.match(profileActions, /has-data-\[icon=inline-start\]:pl-0/);
  assert.match(profileActions, /has-data-\[icon=inline-end\]:pr-0/);
  assert.match(profile, /group-hover\/avatar-upload:pointer-events-auto/);
  assert.match(profile, /group-hover\/avatar-upload:opacity-100/);
  assert.match(
    profile,
    /group-focus-within\/avatar-upload:pointer-events-auto/,
  );
  assert.match(profile, /group-focus-within\/avatar-upload:opacity-100/);
  assert.doesNotMatch(
    profile,
    /bg-foreground\/45 p-0 text-background opacity-100/,
  );
  assert.doesNotMatch(profile, /top-1\/2 left-1\/2/);
  assert.doesNotMatch(profile, /-translate-x-1\/2/);
  assert.match(profile, /copy\.employeeCode/);
  assert.match(profile, /border-t border-border\/60/);
  assert.match(profile, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
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
  assert.match(
    profile,
    /<ProfileAvatarAction[\s\S]*?buttonSize="touch"[\s\S]*?buttonVariant="outline"/,
  );
  assert.match(
    profile,
    /className="inline-flex min-h-11 items-center text-primary hover:underline"/,
  );
  assert.doesNotMatch(profile, /profile-edit-dialog/);
  assert.doesNotMatch(profile, /profile-avatar-upload/);
  assert.match(profileActions, /dynamic<ProfileEditActionProps>/);
  assert.match(profileActions, /dynamic<ProfileAvatarActionProps>/);
  assert.match(profileActions, /import\("\.\/profile-edit-dialog"\)/);
  assert.match(profileActions, /import\("\.\/profile-avatar-upload"\)/);
  assert.match(profileActions, /ssr: false/);
  assert.match(profile, /buttonSize="touch"/);
  assert.match(profile, /hideHeaderOnMobile/);
  assert.match(profile, /h-16 min-h-16 w-16 min-w-16 sm:h-20 sm:w-20/);
  assert.doesNotMatch(profile, /BranchOperatorPanel/);
  assert.match(profile, /buttonSize="sm"/);
  assert.match(profile, /buttonVariant="outline"/);
  assert.match(profile, /buttonVariant="ghost"/);
  assert.match(profile, /triggerLabel=\{copy\.editProfileShort\}/);
  assert.match(profileActions, /buttonVariant\?: ProfileButtonVariant/);
  assert.doesNotMatch(profile, /flex-col items-center gap-2/);
  assert.doesNotMatch(profile, /className="w-fit text-muted-foreground"/);
  assert.doesNotMatch(profile, /className="w-full min-w-0"/);
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
  assert.match(profile, /columns=\{3\}/);
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
  const baseline = read("supabase/migrations/00000000000000_baseline.sql");
  const profilesTable = pgDumpBlock(
    baseline,
    "-- Name: profiles; Type: TABLE;",
  );
  const updateMyProfileFunction = pgDumpBlock(
    baseline,
    "-- Name: update_my_profile(text, text, text, date); Type: FUNCTION;",
  );
  const updateMyProfileAcl = pgDumpBlock(
    baseline,
    "-- Name: FUNCTION update_my_profile(p_full_name text, p_phone text, p_avatar_url text, p_birth_date date); Type: ACL;",
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
  assert.match(dialog, /name="birthDate"/);
  assert.match(dialog, /type="date"/);
  assert.match(dialog, /autoComplete="name"/);
  assert.match(dialog, /type="tel"/);
  assert.match(dialog, /autoComplete="tel"/);
  assert.match(dialog, /autoComplete="bday"/);
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
  assert.match(profilesTable, /birth_date date/);
  assert.match(
    updateMyProfileFunction,
    /p_birth_date date DEFAULT NULL::date/,
  );
  assert.match(
    updateMyProfileFunction,
    /birth_date = COALESCE\(p_birth_date, birth_date\)/,
  );
  assert.match(updateMyProfileFunction, /WHERE id = auth\.uid\(\)/);
  assert.match(updateMyProfileAcl, /REVOKE ALL[\s\S]*FROM PUBLIC;/);
  assert.match(updateMyProfileAcl, /GRANT ALL[\s\S]*TO authenticated;/);
  assert.match(updateMyProfileAcl, /GRANT ALL[\s\S]*TO service_role;/);
  assert.doesNotMatch(updateMyProfileAcl, / TO anon;/);
});

test("manager personal shift does not reload Team approval queues", () => {
  const home = read("apps/web/lib/staff-runtime/page.tsx");

  assert.doesNotMatch(home, /pendingCheckouts|pendingWaste|pendingCountSlips/);
  assert.doesNotMatch(home, /INVENTORY_WASTE_APPROVE|HR_APPROVE_CHECKOUT/);
});

test("manager shift dashboard keeps the self attendance card", () => {
  const home = read("apps/web/lib/staff-runtime/page.tsx");

  assert.match(
    home,
    /mode === "manager-dashboard"[\s\S]*\{todayCard\}[\s\S]*\{staleOpenShiftSection\}/,
  );
  assert.doesNotMatch(home, /managerActionPanel|Quản lý đội chi nhánh/);
});
