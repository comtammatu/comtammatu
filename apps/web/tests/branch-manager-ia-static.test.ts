import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const ADMIN_DASHBOARD_ROUTE_PREFIXES = [
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
      id: "operator-home",
      surface: "branch",
      entryPath: "/br/[branchId]",
      moduleKey: "operator_home",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-dashboard",
      surface: "branch",
      entryPath: "/br/[branchId]/dashboard",
      moduleKey: "branch_dashboard",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-settings",
      surface: "branch",
      entryPath: "/br/[branchId]/settings",
      moduleKey: "branch_settings",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-menu-limits",
      surface: "branch",
      entryPath: "/br/[branchId]/menu-limits",
      moduleKey: "branch_menu_limits",
      primaryNav: "operator-bottom-nav",
    },
    {
      id: "branch-pos-sessions",
      surface: "branch",
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
    "`/br/${branchId}/profile`",
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
    "/notifications",
    "/more",
  ]) {
    assert.doesNotMatch(
      bottomNav,
      new RegExp(`\`/br/\\$\\{branchId\\}${escapeRegExp(forbiddenRoute)}`),
      `${forbiddenRoute} must stay out of the persistent bottom nav`,
    );
  }

  assert.doesNotMatch(bottomNav, /\bEllipsis\b/);
  assert.match(bottomNav, /\bUser\b/);
});

test("POS, KDS, and Runner stay standalone station apps", () => {
  const routeMap = read("packages/shared/src/auth/route-map.ts");

  for (const contract of [
    {
      id: "pos",
      surface: "branch",
      entryPath: "/br/[branchId]/pos",
      moduleKey: "pos",
      primaryNav: "operational-chrome",
    },
    {
      id: "kds",
      surface: "branch",
      entryPath: "/br/[branchId]/kds",
      moduleKey: "kds",
      primaryNav: "operational-chrome",
    },
    {
      id: "runner",
      surface: "branch",
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
      /<AppPage|OperatorBottomNav|AdminDashboardModuleShell/,
    );
  }
});

test("Branch operator routes do not link, redirect, or revalidate Admin Dashboard routes", () => {
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
      for (const prefix of ADMIN_DASHBOARD_ROUTE_PREFIXES) {
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
    ["AdminDashboardModuleShell", /\bAdminDashboardModuleShell\b/],
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

test("Branch routes do not import the Owner-only global menu capability or actions", () => {
  for (const dir of [
    "apps/web/app/(protected)/br/[branchId]/pos",
    "apps/web/app/(protected)/br/[branchId]/kds",
    "apps/web/app/(protected)/br/[branchId]/runner",
    "apps/web/app/(protected)/br/[branchId]/(operator)",
  ]) {
    if (!existsSync(resolve(repoRoot, dir))) continue;
    for (const file of listSourceFiles(dir)) {
      const source = read(file);
      assert.doesNotMatch(source, /MODULE_ACL\.menu\b/, file);
      assert.doesNotMatch(source, /\(protected\)\/menu\/actions/, file);
    }
  }

  const moduleAcl = read("packages/shared/src/auth/module-acl.ts");
  const menuActions = read("apps/web/app/(protected)/menu/actions.ts");
  const branchMenuActions = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/actions.ts",
  );

  assert.match(moduleAcl, /menu:\s*\{[\s\S]*?allowedRoles:\s*\["owner"\]/);
  assert.match(menuActions, /MODULE_ACL\.menu\.allowedRoles/);
  assert.match(
    branchMenuActions,
    /MODULE_ACL\.branch_menu_limits\.allowedRoles/,
  );
});

test("refund review and control stay Owner-only through the database boundary", () => {
  const migration = read(
    "supabase/migrations/20260713210000_enforce_owner_only_refund_controls.sql",
  );
  const paidRefundMigration = read(
    "supabase/migration-archive/20260708123500_pos_sale_refund_restore.sql",
  );
  const refundActions = read(
    "apps/web/app/(protected)/orders/refund-actions.ts",
  );
  const voidPaidAction = read(
    "apps/web/app/(protected)/br/[branchId]/pos/void-paid-actions.ts",
  );
  const orderReads = read(
    "apps/web/app/(protected)/br/[branchId]/pos/order-reads.ts",
  );

  assert.match(refundActions, /const FETCH_ROLES: StaffRole\[\] = \["owner"\]/);
  assert.match(
    refundActions,
    /const APPROVE_ROLES: StaffRole\[\] = \["owner"\]/,
  );
  assert.match(
    migration,
    /ARRAY\[\s*'orders:refund',\s*'orders:refund_approve',\s*'pos:void_paid_order'\s*\]::text\[\]/,
  );
  assert.match(voidPaidAction, /const VOID_PAID_ROLES = \["owner"\] as const/);
  assert.match(orderReads, /canVoidPaidOrder: claims\.user_role === "owner"/);
  assert.match(
    refundActions,
    /\.eq\("status", "pending"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.maybeSingle\(\)/,
    "refund rejection must lose safely when approval already changed the pending row",
  );
  assert.match(
    paidRefundMigration,
    /IF NOT public\.has_permission\(v_order\.branch_id, 'pos:void_paid_order'\) THEN[\s\S]*?RAISE EXCEPTION 'forbidden'/,
  );
  assert.match(
    paidRefundMigration,
    /GRANT EXECUTE ON FUNCTION public\.refund_paid_order\(bigint, text\) TO authenticated, service_role/,
  );
  for (const policy of ["refunds_select", "refunds_insert", "refunds_update"]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY ${policy}[\\s\\S]*?public\\.auth_is_owner\\(auth\\.uid\\(\\)\\)`,
      ),
    );
  }
});

test("Branch Hub does not restore the retired readiness presentation", () => {
  for (const path of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/hub/hub-readiness-section.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_lib/command-config.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/_components/command-sections.tsx",
  ]) {
    assert.equal(existsSync(resolve(repoRoot, path)), false, path);
  }
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
  const settingsMessages = read("apps/web/lib/messages/settings.ts");

  assert.match(settingsHub, /<BranchOperatorPage/);
  assert.match(settingsHub, /<BranchOperatorActionSection/);
  assert.doesNotMatch(settingsHub, /<AppLinkCard/);
  assert.doesNotMatch(settingsHub, /<LinkCardGrid/);
  assert.match(settingsHub, /presentation="plain"/);
  assert.match(settingsHub, /columns=\{1\}/);
  assert.doesNotMatch(
    settingsHub,
    /HubReadinessSection|canAccess\(|visibleTiles/,
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
  assert.match(
    settingsMessages,
    /hubDescription: "Bàn, POS, bếp và in"/,
    "Settings hub description should state the concrete setup scope",
  );
  assert.match(
    settingsMessages,
    /posSetupTitle: "Máy POS"/,
    "Settings POS tile must describe terminal setup without exposing owner policy",
  );
  assert.doesNotMatch(
    settingsMessages,
    /Bàn, máy POS, trạm bếp, máy in và cấu hình chấm công của chi nhánh/,
    "Settings hub must not advertise attendance setup unless it exposes that tile",
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
  assert.match(terminalsClient, /mobileBreakpoint=\{embedded \? 1280 : 1024\}/);
  assert.match(stationsClient, /mobileBreakpoint=\{embedded \? 1280 : 1024\}/);
  assert.match(tableTable, /mobileBreakpoint=\{1024\}/);
  assert.doesNotMatch(
    posSessionsClient,
    /<DataTable|mobileBreakpoint=\{1024\}/,
  );
  assert.match(posSessionsClient, /<ItemGroup>/);
  assert.match(posSessionsClient, /<Drawer/);
  assert.match(posSessionsClient, /<BranchOperatorFrame/);
  assert.match(posSessionsClient, /min-w-0/);
  assert.match(tablesClient, /<AppPageTabs/);
  assert.match(tablesClient, /paramKey="view"/);
  assert.doesNotMatch(tablesClient, /branch-select|selectedBranchId/);
  assert.match(terminalsClient, /size="icon-touch"/);
  assert.match(stationsClient, /size="icon-touch"/);
  assert.match(stockControlCard, /<Switch[\s\S]*?size="touch"/);
  assert.match(sheet, /size="icon-touch"/);
  assert.match(terminalsClient, /const canSwitchBranch = branches\.length > 1/);
  assert.match(stationsClient, /const canSwitchBranch = branches\.length > 1/);
  assert.doesNotMatch(printersClient, /canSwitchBranch|branches:/);
  assert.match(terminalsClient, /filters=\{\s*canSwitchBranch \?/);
  assert.match(stationsClient, /filters=\{\s*canSwitchBranch \?/);
  assert.match(printersClient, /"connection" \| "routing"/);
  assert.match(printersClient, /<SheetContent/);
  assert.doesNotMatch(printersClient, /AppSection|AppDialog/);
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
  assert.match(printersClient, /size="touch"/);
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
      for (const prefix of ADMIN_DASHBOARD_ROUTE_PREFIXES) {
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
  assert.doesNotMatch(
    branchWasteCreateClient,
    /router\.back\(\)/,
    "branch waste form must not depend on browser history to stay in the branch shell",
  );
});

test("Branch-scoped operational routes do not use management shell", () => {
  const forbiddenShells = [
    ["BranchManagementShell", /BranchManagementShell/],
    ["AdminDashboardModuleShell", /AdminDashboardModuleShell/],
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
