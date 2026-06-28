import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function listSourceFiles(dir: string): string[] {
  const absDir = resolve(repoRoot, dir);
  return readdirSync(absDir).flatMap((entry) => {
    const absPath = join(absDir, entry);
    const relPath = `${dir}/${entry}`;
    if (statSync(absPath).isDirectory()) {
      return listSourceFiles(relPath);
    }
    return /\.(?:ts|tsx)$/.test(entry) ? [relPath] : [];
  });
}

test("Branch management routes use management contract without a parent branch layout", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");
  const shell = read(
    "apps/web/app/(protected)/br/[branchId]/_components/branch-management-chrome.tsx",
  );
  // S1 (D048) deduped the brand + pageHeader assembly: both Management shells
  // now delegate to the shared ManagementShell, which owns the <AppShell> mount
  // and resolves the cross-module primary tabs once. The branch shell stays a
  // thin caller that supplies its own brand + branch deep nav.
  const managementChrome = read("apps/web/app/components/management-chrome.tsx");

  assert.match(
    routeMap,
    /id: "branch-settings"[\s\S]*?surface: "branch_management"[\s\S]*?primaryNav: "management-sidebar"/,
    "branch settings must use management chrome",
  );
  assert.match(
    routeMap,
    /id: "branch-dashboard"[\s\S]*?surface: "branch_management"[\s\S]*?primaryNav: "management-sidebar"/,
    "branch dashboard must use management chrome",
  );
  assert.match(
    routeMap,
    /id: "branch-menu-limits"[\s\S]*?surface: "branch_operation"[\s\S]*?primaryNav: "operational-chrome"/,
    "menu limits remains a daily operation, not setup",
  );
  assert.match(
    managementChrome,
    /<AppShell/,
    "the shared ManagementShell mounts the single AppShell chrome",
  );
  assert.match(
    managementChrome,
    /tier1=\{resolveOfficePrimaryTabs\(role, branchId\)\}/,
    "the shared ManagementShell resolves the cross-module primary tabs once",
  );
  assert.match(
    shell,
    /<ManagementShell/,
    "branch management must delegate to the shared management chrome",
  );
  assert.match(shell, /tier2=\{resolveBranchDeepNav\(role, branchId\)\}/);
  assert.doesNotMatch(
    shell,
    /bottomNav=\{false\}/,
    "branch management is management chrome and must keep the shared mobile bottom nav",
  );
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/(protected)/br/[branchId]/layout.tsx"),
    ),
    false,
    "do not add a parent /br/[branchId]/layout.tsx; it would wrap POS/KDS/Runner",
  );
});

test("Branch command dashboard is split into readiness, live operation, setup, and drilldown lanes", () => {
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/dashboard/page.tsx",
  );
  // Wave 6 extracted the lane tile/readiness config and lane-rendering markup
  // into co-located files; assert the moved strings against their new homes.
  const commandConfig = read(
    "apps/web/app/(protected)/br/[branchId]/dashboard/_lib/command-config.tsx",
  );
  const commandSections = read(
    "apps/web/app/(protected)/br/[branchId]/dashboard/_components/command-sections.tsx",
  );
  const actionItem = read(
    "apps/web/app/(protected)/br/[branchId]/_components/branch-action-item.tsx",
  );

  // Lane titles still drive the page's section layout.
  for (const expected of [
    "readinessTitle",
    "liveOperationsTitle",
    "endDayTitle",
    "setupLaneTitle",
    "drilldownTitle",
  ]) {
    assert.ok(dashboard.includes(expected), `expected ${expected}`);
  }
  // Lane hrefs now live in the extracted tile config (buildTileGroups).
  for (const expected of [
    "/br/${branchId}/settings/menu-limits",
    "/br/${branchId}/settings/pos-sessions",
  ]) {
    assert.ok(commandConfig.includes(expected), `expected ${expected}`);
  }
  // Nav lanes render through AppLinkCard inside LinkCardGrid (the new DoD),
  // while the readiness lane keeps the mobile-first BranchActionItem list.
  assert.match(
    commandSections,
    /<AppLinkCard/,
    "Branch Command nav lanes should render via AppLinkCard",
  );
  assert.match(
    commandSections,
    /<LinkCardGrid/,
    "Branch Command nav lanes should grid through LinkCardGrid",
  );
  assert.match(
    commandSections,
    /<BranchActionItem/,
    "Branch Command readiness lane should render the mobile-first action list",
  );
  assert.match(
    dashboard,
    /<BranchReadinessList/,
    "Branch Command page should mount the readiness lane",
  );
  assert.match(
    dashboard,
    /<BranchCommandTileGrid/,
    "Branch Command page should mount the nav-lane tile grids",
  );
  assert.match(
    actionItem,
    /line-clamp-none/,
    "Branch Command must not clamp critical readiness/action descriptions",
  );
  // KPI density now flows through <KpiRow>: base grid-cols-1 sm:grid-cols-2
  // lg:grid-cols-3 with the page adding xl:grid-cols-4 via className.
  assert.match(
    dashboard,
    /<KpiRow className="xl:grid-cols-4"/,
    "KPI cards should be one column on mobile, then add density at wider breakpoints",
  );
  assert.doesNotMatch(
    dashboard,
    /grid-cols-2 gap-3 lg:grid-cols-4/,
    "KPI cards must not force two columns on phone-width viewports",
  );
});

test("Branch settings hub exposes setup and branch operating controls", () => {
  const settingsHub = read(
    "apps/web/app/(protected)/br/[branchId]/settings/page.tsx",
  );
  const attendanceSettingsCard = read(
    "apps/web/app/(protected)/br/[branchId]/settings/attendance-settings-card.tsx",
  );
  const actionItem = read(
    "apps/web/app/(protected)/br/[branchId]/_components/branch-action-item.tsx",
  );

  // Wave 6 relaid the hub from an ItemGroup/BranchActionItem list to AppLinkCard
  // tiles inside LinkCardGrid, with the tile config (incl. route hrefs) hoisted
  // into the co-located _lib/hub-tiles.ts.
  const hubTiles = read(
    "apps/web/app/(protected)/br/[branchId]/settings/_lib/hub-tiles.ts",
  );

  assert.match(settingsHub, /AttendanceSettingsCard/);
  assert.match(settingsHub, /<AppSection/);
  assert.match(settingsHub, /<AppLinkCard/);
  assert.match(settingsHub, /<LinkCardGrid/);
  // Per-tile ACL gating keeps each tile to surfaces the role can open.
  assert.match(
    settingsHub,
    /canAccess\(role, tile\.moduleKey\)/,
    "settings hub tiles must be module-ACL gated per tile",
  );
  // Setup/operating route hrefs now live in the extracted tile config.
  assert.match(hubTiles, /settings\/tables/);
  assert.match(hubTiles, /settings\/pos/);
  assert.match(hubTiles, /settings\/printers/);
  assert.match(hubTiles, /settings\/kds/);
  assert.match(hubTiles, /settings\/pos-sessions/);
  assert.match(hubTiles, /menu-limits/);
  assert.match(
    actionItem,
    /line-clamp-none/,
    "Attendance setup row should keep setup copy visible on mobile",
  );
  assert.match(attendanceSettingsCard, /BranchActionItem/);
  assert.doesNotMatch(hubTiles, /href:\s*"\/menu"/);
  assert.doesNotMatch(settingsHub, /className="md:p-6"/);
  assert.doesNotMatch(
    attendanceSettingsCard,
    /@comtammatu\/ui\/components\/card/,
    "Attendance setup must share the setup-list primitive instead of a route-local card",
  );
});

test("Branch setup clients keep mobile-stable toolbars and table surfaces", () => {
  const terminalsClient = read(
    "apps/web/app/(protected)/branch-settings/_shared/pos/terminals-client.tsx",
  );
  const stationsClient = read(
    "apps/web/app/(protected)/branch-settings/_shared/kds/stations-client.tsx",
  );
  const tablesClient = read(
    "apps/web/app/(protected)/branch-settings/_shared/tables/tables-client.tsx",
  );
  const tableTable = read(
    "apps/web/app/(protected)/branch-settings/_shared/tables/table-table.tsx",
  );
  const posSessionsClient = read(
    "apps/web/app/(protected)/br/[branchId]/settings/pos-sessions/pos-sessions-client.tsx",
  );
  const setupClients = [
    terminalsClient,
    stationsClient,
    tablesClient,
    tableTable,
    posSessionsClient,
  ].join("\n");

  assert.match(terminalsClient, /DataTable/);
  assert.match(stationsClient, /DataTable/);
  assert.match(tableTable, /DataTable/);
  assert.match(tablesClient, /w-full sm:w-60/);
  assert.doesNotMatch(setupClients, /SelectTrigger className="w-60"/);
  assert.doesNotMatch(setupClients, /className="ml-auto"/);
  assert.doesNotMatch(setupClients, /mr-2 size-4/);
  assert.doesNotMatch(setupClients, /max-w-xs truncate/);
});

test("Branch settings pages do not import admin route-local settings clients", () => {
  for (const file of listSourceFiles(
    "apps/web/app/(protected)/br/[branchId]/settings",
  )) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /@\/\(protected\)\/admin\/settings\/(?:tables|pos|kds|printers)\//,
      `${file} must import shared setup clients instead of admin route-local clients`,
    );
  }
});

test("POS KDS and Runner remain operational fullscreen surfaces", () => {
  for (const dir of [
    "apps/web/app/(protected)/br/[branchId]/pos",
    "apps/web/app/(protected)/br/[branchId]/kds",
    "apps/web/app/(protected)/br/[branchId]/runner",
  ]) {
    if (!existsSync(resolve(repoRoot, dir))) continue;
    for (const file of listSourceFiles(dir)) {
      assert.doesNotMatch(
        read(file),
        /BranchManagementShell/,
        `${file} must not be wrapped by the branch management shell`,
      );
    }
  }
});
