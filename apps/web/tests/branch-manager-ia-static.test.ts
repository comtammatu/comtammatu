import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const OWNER_ROUTE_PREFIXES = [
  "/",
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

function assertRouteContract({
  routeMap,
  id,
  surface,
  entryPath,
  moduleKey,
  primaryNav,
}: {
  routeMap: string;
  id: string;
  surface: string;
  entryPath: string;
  moduleKey: string;
  primaryNav: string;
}) {
  const routePattern = new RegExp(
    [
      `id: "${escapeRegExp(id)}"`,
      `surface: "${escapeRegExp(surface)}"`,
      `entryPath: "${escapeRegExp(entryPath)}"`,
      `moduleKeys: \\[[^\\]]*"${escapeRegExp(moduleKey)}"[^\\]]*\\]`,
      `primaryNav: "${escapeRegExp(primaryNav)}"`,
    ].join("[\\s\\S]*?"),
  );

  assert.match(
    routeMap,
    routePattern,
    `${id} route contract must stay ${surface} via ${primaryNav}`,
  );
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

test("Branch command and secondary routes stay in the operator touch plane", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");

  for (const contract of [
    {
      id: "branch-home",
      surface: "branch_operation",
      entryPath: "/br/[branchId]",
      moduleKey: "branch_home",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-dashboard",
      surface: "branch_management",
      entryPath: "/br/[branchId]/dashboard",
      moduleKey: "branch_dashboard",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-settings",
      surface: "branch_management",
      entryPath: "/br/[branchId]/settings",
      moduleKey: "branch_settings",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-menu-limits",
      surface: "branch_operation",
      entryPath: "/br/[branchId]/menu-limits",
      moduleKey: "branch_menu_limits",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-pos-sessions",
      surface: "branch_operation",
      entryPath: "/br/[branchId]/pos-sessions",
      moduleKey: "branch_pos_sessions",
      primaryNav: "operator-bottom-nav",
    },
  ]) {
    assertRouteContract({ routeMap, ...contract });
  }

  for (const forbiddenPath of [
    "apps/web/app/(protected)/br/[branchId]/layout.tsx",
    "apps/web/app/(protected)/br/[branchId]/_components/branch-management-chrome.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/more",
  ]) {
    assert.equal(
      existsSync(resolve(repoRoot, forbiddenPath)),
      false,
      `${forbiddenPath} must not exist in the Branch touch plane`,
    );
  }
});

test("Branch bottom nav only contains persistent daily job families", () => {
  const bottomNav = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  for (const expected of [
    "`/br/${branchId}`",
    "`/br/${branchId}/shift`",
    "`/br/${branchId}/team`",
    "`/br/${branchId}/stock`",
  ]) {
    assert.ok(bottomNav.includes(expected), `expected bottom nav ${expected}`);
  }

  assert.match(
    bottomNav,
    /href: `\/br\/\$\{branchId\}\/shift`[\s\S]*?exact: false/,
    "shift tab must stay prefix-active for /shift/* deep routes",
  );

  for (const forbiddenRoute of [
    "/dashboard",
    "/settings",
    "/menu-limits",
    "/pos-sessions",
    "/profile",
    "/notifications",
    "/more",
  ]) {
    assert.doesNotMatch(
      bottomNav,
      new RegExp(`\`/br/\\$\\{branchId\\}${escapeRegExp(forbiddenRoute)}`),
      `${forbiddenRoute} must stay out of the persistent bottom nav`,
    );
  }

  assert.doesNotMatch(bottomNav, /\bEllipsis\b|\bUser\b/);
});

test("POS, KDS, and Runner stay standalone station apps", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");

  for (const contract of [
    {
      id: "pos",
      surface: "branch_operation",
      entryPath: "/br/[branchId]/pos",
      moduleKey: "pos",
      primaryNav: "operational-chrome",
    },
    {
      id: "kds",
      surface: "branch_operation",
      entryPath: "/br/[branchId]/kds",
      moduleKey: "kds",
      primaryNav: "operational-chrome",
    },
    {
      id: "runner",
      surface: "branch_operation",
      entryPath: "/br/[branchId]/runner",
      moduleKey: "runner",
      primaryNav: "operational-chrome",
    },
  ]) {
    assertRouteContract({ routeMap, ...contract });
  }

  for (const [label, dir, layoutPath] of [
    [
      "POS",
      "apps/web/app/(protected)/br/[branchId]/(operator)/pos",
      "apps/web/app/(protected)/br/[branchId]/pos/layout.tsx",
    ],
    [
      "KDS",
      "apps/web/app/(protected)/br/[branchId]/(operator)/kds",
      "apps/web/app/(protected)/br/[branchId]/kds/layout.tsx",
    ],
    [
      "Runner",
      "apps/web/app/(protected)/br/[branchId]/(operator)/runner",
      "apps/web/app/(protected)/br/[branchId]/runner/layout.tsx",
    ],
  ] as const) {
    assert.equal(
      existsSync(resolve(repoRoot, dir)),
      false,
      `${label} must not move under the operator route group`,
    );

    const layout = read(layoutPath);
    assert.match(layout, /<main/);
    assert.match(layout, /h-dvh/);
    assert.match(layout, /touch-manipulation/);
    assert.doesNotMatch(
      layout,
      /<AppPage|OperatorBottomNav|OwnerModuleShell/,
    );
  }
});

test("Branch operator routes do not link, redirect, or revalidate Owner surface routes", () => {
  for (const dir of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard",
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock",
    "apps/web/app/(protected)/br/[branchId]/(operator)/team",
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions",
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits",
    "apps/web/app/(protected)/branch-settings/_shared",
  ]) {
    if (!existsSync(resolve(repoRoot, dir))) continue;
    for (const file of listSourceFiles(dir)) {
      const source = read(file);
      for (const prefix of OWNER_ROUTE_PREFIXES) {
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
});

test("Branch operator routes do not import management shell chrome", () => {
  const forbiddenShells = [
    ["BranchManagementShell", /\bBranchManagementShell\b/],
    ["OwnerModuleShell", /\bOwnerModuleShell\b/],
    ["InventoryShell", /\bInventoryShell\b/],
    ["FinanceShell", /\bFinanceShell\b/],
    ["ManagementShell", /\bManagementShell\b/],
    ["AppShell", /\bAppShell\b/],
  ] as const;

  for (const dir of [
    "apps/web/app/(protected)/br/[branchId]/pos",
    "apps/web/app/(protected)/br/[branchId]/kds",
    "apps/web/app/(protected)/br/[branchId]/runner",
    "apps/web/app/(protected)/br/[branchId]/(operator)",
  ]) {
    if (!existsSync(resolve(repoRoot, dir))) continue;
    for (const file of listSourceFiles(dir)) {
      const source = read(file);
      for (const [label, forbiddenShell] of forbiddenShells) {
        assert.doesNotMatch(
          source,
          forbiddenShell,
          `${file} must not import or render ${label}`,
        );
      }
    }
  }
});

test("Branch command dashboard is a branch-native command surface", () => {
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  const commandConfig = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_lib/command-config.tsx",
  );
  const commandSections = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_components/command-sections.tsx",
  );
  const actionItem = read(
    "apps/web/app/(protected)/br/[branchId]/_components/branch-action-item.tsx",
  );
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  assert.match(dashboard, /<BranchOperatorPage/);
  assert.match(dashboard, /branch\.branch_kind !== "branch"/);
  assert.doesNotMatch(dashboard, /<AppPage|<AppLinkCard|<LinkCardGrid|<KpiRow/);

  for (const expected of [
    "liveOperationsTitle",
    "readinessTitle",
    "endDayTitle",
    "drilldownTitle",
  ]) {
    assert.ok(dashboard.includes(expected), `expected ${expected}`);
  }

  for (const expected of [
    "/br/${branchId}/pos",
    "/br/${branchId}/kds",
    "/br/${branchId}/runner",
    "/br/${branchId}/menu-limits",
    "/br/${branchId}/orders",
    "/br/${branchId}/pos-sessions",
    "/br/${branchId}/stock",
  ]) {
    assert.ok(commandConfig.includes(expected), `expected ${expected}`);
  }

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
    /const floorHref =[\s\S]*day\.tablesTotal <= 0[\s\S]*day\.setupActiveTerminals <= 0/,
    "Bàn & máy POS readiness CTA must route to the missing setup part",
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
  assert.match(actionItem, /size="touch"/);
  assert.match(actionItem, /className="w-full sm:w-auto"/);
  assert.match(
    settingsMessages,
    /commandPosSessionsTitle: "Đối soát ca POS"/,
    "Branch Command reconciliation tile should not duplicate the readiness Ca POS label",
  );
  assert.doesNotMatch(
    settingsMessages,
    /setupLaneTitle|commandBranchSetup/,
    "Branch Command must not keep a Settings doorway lane; Settings is already the setup landing",
  );
  assert.doesNotMatch(
    commandConfig,
    /href:\s*`\/br\/\$\{branchId\}\/settings`/,
  );
  assert.doesNotMatch(commandConfig, /IconSettings/);
  assert.match(
    settingsMessages,
    /readinessMenuTitle: "Giới hạn bán"/,
    "Branch Command readiness row links to menu-limits, not the menu catalog",
  );
  assert.match(settingsMessages, /drilldownTitle: "Kho chi nhánh"/);
  assert.match(settingsMessages, /readinessMenuCta: "Mở giới hạn bán"/);
  assert.doesNotMatch(settingsMessages, /Thực đơn bán|Mở thực đơn/);
  assert.doesNotMatch(settingsMessages, /Chưa có món active/);
});

test("Branch settings landing exposes setup controls only", () => {
  const settingsLanding = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  // The branch setup landing follows the operator/employee action-row rhythm; route
  // hrefs stay in the co-located tile config.
  const settingsLinks = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/_lib/settings-links.ts",
  );
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  assert.match(settingsLanding, /<BranchOperatorPage/);
  assert.match(settingsLanding, /<BranchOperatorActionSection/);
  assert.doesNotMatch(settingsLanding, /<AppLinkCard/);
  assert.doesNotMatch(settingsLanding, /<LinkCardGrid/);
  // Per-tile ACL gating keeps each tile to surfaces the role can open.
  assert.match(
    settingsLanding,
    /canAccess\(role, link\.moduleKey\)/,
    "settings landing tiles must be module-ACL gated per tile",
  );
  // Setup route hrefs now live in the extracted tile config.
  assert.match(settingsLinks, /settings\/tables/);
  assert.match(settingsLinks, /settings\/pos/);
  assert.match(settingsLinks, /settings\/printers/);
  assert.match(settingsLinks, /settings\/kds/);
  assert.doesNotMatch(settingsLinks, /settings\/pos-sessions/);
  assert.doesNotMatch(settingsLinks, /menu-limits/);
  assert.doesNotMatch(settingsLinks, /href:\s*"\/menu"/);
  assert.doesNotMatch(settingsLanding, /AttendanceSettingsCard/);
  assert.doesNotMatch(settingsLanding, /\/hr/);
  assert.doesNotMatch(settingsLanding, /className="md:p-6"/);
  assert.match(
    settingsMessages,
    /landingDescription: \(branchName: string\) =>\s*`\$\{branchName\} · Bàn, POS, bếp và in`/,
    "Settings landing description should state the concrete setup scope",
  );
  assert.match(
    settingsMessages,
    /posSetupTitle: "Máy POS & tồn kho"/,
    "Settings POS tile must name the stock-control policy it contains",
  );
  assert.doesNotMatch(
    settingsMessages,
    /Bàn, máy POS, trạm bếp, máy in và cấu hình chấm công của chi nhánh/,
    "Settings landing must not advertise attendance setup unless it exposes that tile",
  );
});

test("Branch setup clients and POS sessions keep mobile-stable surfaces", () => {
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
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  const stockControlCard = read(
    "apps/web/app/(protected)/branch-settings/_shared/pos/stock-control-card.tsx",
  );
  const dataTable = read("apps/web/app/components/data-table/data-table.tsx");
  const sheet = read("packages/ui/src/components/sheet.tsx");
  const setupClients = [
    terminalsClient,
    stationsClient,
    tablesClient,
    printersClient,
    tableTable,
    posSessionsClient,
    stockControlCard,
  ].join("\n");

  assert.match(terminalsClient, /DataTable/);
  assert.match(stationsClient, /DataTable/);
  assert.match(tableTable, /DataTable/);
  assert.match(dataTable, /mobileBreakpoint\?: number/);
  assert.match(dataTable, /useIsMobile\(mobileBreakpoint\)/);
  assert.match(terminalsClient, /mobileBreakpoint=\{1024\}/);
  assert.match(stationsClient, /mobileBreakpoint=\{1024\}/);
  assert.match(tableTable, /mobileBreakpoint=\{1024\}/);
  assert.doesNotMatch(
    posSessionsClient,
    /<DataTable|mobileBreakpoint=\{1024\}/,
  );
  assert.match(posSessionsClient, /<ItemGroup>/);
  assert.match(posSessionsClient, /<Drawer/);
  assert.match(posSessionsClient, /<BranchOperatorFrame/);
  assert.match(posSessionsClient, /min-w-0/);
  assert.match(tablesClient, /w-full sm:w-60/);
  assert.match(tablesClient, /<TabsList className="h-11 w-full"/);
  assert.match(terminalsClient, /size="icon-touch"/);
  assert.match(stationsClient, /size="icon-touch"/);
  assert.match(stockControlCard, /<Switch[\s\S]*?size="touch"/);
  assert.match(sheet, /size="icon-touch"/);
  assert.match(terminalsClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(stationsClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(tablesClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(printersClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(terminalsClient, /filters=\{\s*canSwitchBranch \?/);
  assert.match(stationsClient, /filters=\{\s*canSwitchBranch \?/);
  assert.match(tablesClient, /\{canSwitchBranch \? \(\s*<AppToolbar/);
  assert.match(printersClient, /\{canSwitchBranch \? \(\s*<div/);
  assert.doesNotMatch(setupClients, /SelectTrigger className="w-60"/);
  assert.doesNotMatch(setupClients, /size="icon"/);
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
    /basis-full justify-start pt-1 sm:ml-auto sm:basis-auto sm:justify-end sm:pt-0/,
    "printer row actions should occupy their own mobile row and align right on desktop",
  );
  assert.match(printersClient, /className="w-full sm:w-auto"/);
});

test("Branch settings pages do not import admin route-local settings clients", () => {
  for (const file of listSourceFiles(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings",
  )) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /@\/\(protected\)\/settings\/(?:tables|pos|kds|printers)\//,
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
      for (const prefix of OWNER_ROUTE_PREFIXES) {
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

  const branchWasteCreateClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/branch-waste-create-client.tsx",
  );
  assert.match(
    branchWasteCreateClient,
    /href=\{stockBasePath\}/,
    "branch waste form needs an explicit cancel target back to the stock landing",
  );
  assert.doesNotMatch(
    branchWasteCreateClient,
    /router\.back\(\)/,
    "branch waste form must not depend on browser history to stay in the branch shell",
  );
});

test("Branch-scoped operational routes do not use management shell", () => {
  const forbiddenShells = [
    ["BranchManagementShell", /BranchManagementShell/],
    ["OwnerModuleShell", /OwnerModuleShell/],
    ["InventoryShell", /InventoryShell/],
    ["FinanceShell", /FinanceShell/],
    ["ManagementShell", /ManagementShell/],
    ["AppPage import", /import\s+\{[^}]*\bAppPage\b/],
    ["AppPage render", /<AppPage\b/],
  ] as const;

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
      for (const [label, forbiddenShell] of forbiddenShells) {
        assert.doesNotMatch(
          source,
          forbiddenShell,
          `${file} must not import or render ${label}; the operator layout owns page chrome`,
        );
      }
    }
  }
});
