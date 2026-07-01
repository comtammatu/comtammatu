import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const OFFICE_ROUTE_PREFIXES = [
  "/admin",
  "/branch-settings",
  "/branches",
  "/finance",
  "/hr",
  "/inventory",
  "/menu",
  "/orders",
];
const ROUTE_LITERAL_END = "(?:$|[/?#\"'`}])";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

test("Branch command and settings routes belong to the operator contract", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");

  assert.match(
    routeMap,
    /id: "branch-settings"[\s\S]*?surface: "branch_management"[\s\S]*?primaryNav: "operator-bottom-nav"/,
    "branch settings must use branch runtime chrome without being a staff operation route",
  );
  assert.match(
    routeMap,
    /id: "branch-dashboard"[\s\S]*?surface: "branch_management"[\s\S]*?primaryNav: "operator-bottom-nav"/,
    "branch dashboard must use branch runtime chrome without being a staff operation route",
  );
  assert.match(
    routeMap,
    /id: "branch-menu-limits"[\s\S]*?surface: "branch_management"[\s\S]*?primaryNav: "operator-bottom-nav"/,
    "menu limits are manager-owned branch controls, not employee runtime chrome",
  );
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/br/[branchId]/_components/branch-management-chrome.tsx",
      ),
    ),
    false,
    "branch command/settings must not keep a second management shell wrapper",
  );
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/(protected)/br/[branchId]/layout.tsx"),
    ),
    false,
    "do not add a parent /br/[branchId]/layout.tsx; it would wrap POS/KDS/Runner",
  );
});

test("Station apps keep standalone operational chrome, not operator or admin shell", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");
  const posLayout = read(
    "apps/web/app/(protected)/br/[branchId]/pos/layout.tsx",
  );
  const kdsLayout = read(
    "apps/web/app/(protected)/br/[branchId]/kds/layout.tsx",
  );
  const runnerLayout = read(
    "apps/web/app/(protected)/br/[branchId]/runner/layout.tsx",
  );
  const kdsPage = read("apps/web/app/(protected)/br/[branchId]/kds/page.tsx");
  const runnerPage = read(
    "apps/web/app/(protected)/br/[branchId]/runner/page.tsx",
  );
  const foregroundNotificationsHook = read(
    "apps/web/app/_hooks/use-foreground-notifications.ts",
  );

  assert.match(
    routeMap,
    /id: "pos"[\s\S]*?surface: "branch_operation"[\s\S]*?primaryNav: "operational-chrome"/,
    "POS must stay a standalone station app, not bottom-nav branch shell",
  );
  assert.match(
    routeMap,
    /id: "kds"[\s\S]*?surface: "branch_operation"[\s\S]*?primaryNav: "operational-chrome"/,
    "KDS must stay a standalone station app, not bottom-nav branch shell",
  );
  assert.match(
    routeMap,
    /id: "runner"[\s\S]*?surface: "branch_operation"[\s\S]*?primaryNav: "operational-chrome"/,
    "Runner must stay a standalone station app, not bottom-nav branch shell",
  );
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/(protected)/br/[branchId]/(operator)/pos"),
    ),
    false,
    "do not move POS under the operator shell",
  );
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/(protected)/br/[branchId]/(operator)/kds"),
    ),
    false,
    "do not move KDS under the operator shell",
  );
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/br/[branchId]/(operator)/runner",
      ),
    ),
    false,
    "do not move Runner under the operator shell",
  );

  for (const [label, source] of [
    ["POS", posLayout],
    ["KDS", kdsLayout],
    ["Runner", runnerLayout],
  ] as const) {
    assert.match(source, /<main/, `${label} layout must own its own main shell`);
    assert.match(source, /h-dvh/, `${label} layout must be viewport-first`);
    assert.doesNotMatch(source, /<AppPage|OperatorBottomNav|management-chrome/);
  }

  assert.match(kdsPage, /function KdsStatusShell/);
  assert.match(kdsPage, /<AppEmptyState/);
  assert.doesNotMatch(kdsPage, /@comtammatu\/ui\/components\/alert/);
  assert.match(runnerPage, /function RunnerErrorState/);
  assert.match(runnerPage, /<AppEmptyState/);
  assert.doesNotMatch(runnerPage, /@comtammatu\/ui\/components\/alert/);
  assert.match(foregroundNotificationsHook, /isRunnerPublicDisplayPath/);
  assert.match(foregroundNotificationsHook, /if \(disabled\) return null/);
});

test("Branch command dashboard is split into readiness, end-day, setup, and drilldown lanes", () => {
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  // Wave 6 extracted the lane tile/readiness config and lane-rendering markup
  // into co-located files; assert the moved strings against their new homes.
  const commandConfig = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_lib/command-config.tsx",
  );
  const commandSections = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_components/command-sections.tsx",
  );
  const actionItem = read(
    "apps/web/app/(protected)/br/[branchId]/_components/branch-action-item.tsx",
  );

  // Lane titles still drive the page's section layout.
  for (const expected of [
    "readinessTitle",
    "endDayTitle",
    "setupLaneTitle",
    "drilldownTitle",
  ]) {
    assert.ok(dashboard.includes(expected), `expected ${expected}`);
  }
  // Lane hrefs now live in the extracted tile config (buildTileGroups).
  for (const expected of [
    "/br/${branchId}/settings/pos-sessions",
  ]) {
    assert.ok(commandConfig.includes(expected), `expected ${expected}`);
  }
  assert.doesNotMatch(dashboard, /liveOperationsTitle/);
  assert.doesNotMatch(commandConfig, /liveOperations/);
  // Nav lanes and readiness now share the mobile-first action-row rhythm.
  assert.match(
    commandSections,
    /<BranchActionItem/,
    "Branch Command lanes should render mobile-first action rows",
  );
  assert.match(
    commandSections,
    /<ItemGroup className="gap-2"/,
    "Branch Command lanes should group action rows consistently",
  );
  assert.doesNotMatch(
    commandSections,
    /<AppLinkCard|<LinkCardGrid/,
    "Branch Command lanes must not reintroduce card-grid navigation",
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

test("Branch settings hub exposes setup controls only", () => {
  const settingsHub = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  // The branch setup hub follows the operator/employee action-row rhythm; route
  // hrefs stay in the co-located tile config.
  const hubTiles = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/_lib/hub-tiles.ts",
  );

  assert.match(settingsHub, /<EmployeePage/);
  assert.match(settingsHub, /<EmployeeActionSection/);
  assert.doesNotMatch(settingsHub, /<AppLinkCard/);
  assert.doesNotMatch(settingsHub, /<LinkCardGrid/);
  // Per-tile ACL gating keeps each tile to surfaces the role can open.
  assert.match(
    settingsHub,
    /canAccess\(role, tile\.moduleKey\)/,
    "settings hub tiles must be module-ACL gated per tile",
  );
  // Setup route hrefs now live in the extracted tile config.
  assert.match(hubTiles, /settings\/tables/);
  assert.match(hubTiles, /settings\/pos/);
  assert.match(hubTiles, /settings\/printers/);
  assert.match(hubTiles, /settings\/kds/);
  assert.doesNotMatch(hubTiles, /settings\/pos-sessions/);
  assert.doesNotMatch(hubTiles, /menu-limits/);
  assert.doesNotMatch(hubTiles, /href:\s*"\/menu"/);
  assert.doesNotMatch(settingsHub, /AttendanceSettingsCard/);
  assert.doesNotMatch(settingsHub, /\/hr/);
  assert.doesNotMatch(settingsHub, /className="md:p-6"/);
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
  const printersClient = read(
    "apps/web/app/(protected)/branch-settings/_shared/printers/printers-client.tsx",
  );
  const tableTable = read(
    "apps/web/app/(protected)/branch-settings/_shared/tables/table-table.tsx",
  );
  const posSessionsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos-sessions/pos-sessions-client.tsx",
  );
  const setupClients = [
    terminalsClient,
    stationsClient,
    tablesClient,
    printersClient,
    tableTable,
    posSessionsClient,
  ].join("\n");

  assert.match(terminalsClient, /DataTable/);
  assert.match(stationsClient, /DataTable/);
  assert.match(tableTable, /DataTable/);
  assert.match(tablesClient, /w-full sm:w-60/);
  assert.match(terminalsClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(stationsClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(tablesClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(printersClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(terminalsClient, /filters=\{\s*canSwitchBranch \?/);
  assert.match(stationsClient, /filters=\{\s*canSwitchBranch \?/);
  assert.match(tablesClient, /\{canSwitchBranch \? \(\s*<AppToolbar/);
  assert.match(printersClient, /\{canSwitchBranch \? \(\s*<div/);
  assert.doesNotMatch(setupClients, /SelectTrigger className="w-60"/);
  assert.doesNotMatch(setupClients, /className="ml-auto"/);
  assert.doesNotMatch(setupClients, /mr-2 size-4/);
  assert.doesNotMatch(setupClients, /max-w-xs truncate/);
  assert.doesNotMatch(
    setupClients,
    /space-y-/,
    "setup clients should use flex/grid gap rhythm instead of margin-based stacks",
  );
  assert.match(
    printersClient,
    /flex flex-col-reverse gap-2 sm:flex-row sm:justify-end/,
    "printer form actions should stack full-width on mobile and align right on desktop",
  );
});

test("Branch settings pages do not import admin route-local settings clients", () => {
  for (const file of listSourceFiles(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
  )) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /@\/\(protected\)\/admin\/settings\/(?:tables|pos|kds|printers)\//,
      `${file} must import shared setup clients instead of admin route-local clients`,
    );
  }
});

test("Branch setup category lookups stay tenant-scoped", () => {
  for (const file of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/kds/page.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/printers/page.tsx",
  ]) {
    const source = read(file);
    assert.match(
      source,
      /\.from\("menu_categories"\)[\s\S]*?\.eq\("tenant_id", claims\.tenant_id\)[\s\S]*?\.eq\("is_active", true\)/,
      `${file} must scope tenant-wide menu categories by tenant_id`,
    );
  }
});

test("Branch operator settings and stock navigation fallbacks stay branch-native", () => {
  for (const dir of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock",
    "apps/web/app/(protected)/branch-settings/_shared",
  ]) {
    for (const file of listSourceFiles(dir)) {
      const source = read(file);
      for (const prefix of OFFICE_ROUTE_PREFIXES) {
        const route = `${escapeRegExp(prefix)}${ROUTE_LITERAL_END}`;
        for (const [label, pattern] of [
          ["href prop", new RegExp(`href\\s*=\\s*(?:{\\s*)?["'\`]${route}`)],
          ["href field", new RegExp(`href\\s*:\\s*["'\`]${route}`)],
          ["redirect", new RegExp(`redirect\\(\\s*["'\`]${route}`)],
          [
            "router navigation",
            new RegExp(`router\\.(?:push|replace)\\(\\s*["'\`]${route}`),
          ],
          [
            "path revalidation",
            new RegExp(`revalidatePath\\(\\s*["'\`]${route}`),
          ],
        ] as const) {
          assert.doesNotMatch(
            source,
            pattern,
            `${file} must not use ${label} into ${prefix}`,
          );
        }
      }
    }
  }

  const wasteCreateClient = read(
    "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );
  assert.match(
    wasteCreateClient,
    /cancelHref/,
    "branch-mounted waste form needs an explicit cancel fallback",
  );
  assert.doesNotMatch(
    wasteCreateClient,
    /router\.back\(\)/,
    "branch-mounted waste form must not depend on browser history to stay in the branch shell",
  );
});

test("Branch-scoped operational routes do not use management shell", () => {
  const forbiddenShells = [
    /BranchManagementShell/,
    /OfficeModuleShell/,
    /InventoryShell/,
    /FinanceShell/,
    /ManagementShell/,
  ];

  for (const dir of [
    "apps/web/app/(protected)/br/[branchId]/pos",
    "apps/web/app/(protected)/br/[branchId]/kds",
    "apps/web/app/(protected)/br/[branchId]/runner",
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock",
  ]) {
    if (!existsSync(resolve(repoRoot, dir))) continue;
    for (const file of listSourceFiles(dir)) {
      const source = read(file);
      for (const forbiddenShell of forbiddenShells) {
        assert.doesNotMatch(
          source,
          forbiddenShell,
          `${file} must not import or render office/management shell chrome`,
        );
      }
    }
  }
});
