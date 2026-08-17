import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readAttendanceTableModules } from "./helpers/read-attendance-table-modules";
import { toPosixPath } from "./static-source";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

test("Owner bottom nav fits one module action and four destinations", () => {
  const source = read("apps/web/app/components/control-surface-bottom-nav.tsx");

  assert.match(source, /const MAX_VISIBLE_ITEMS = 4/);
  assert.equal(source.match(/min-w-14/g)?.length, 2);
  assert.doesNotMatch(source, /min-w-16/);
  assert.match(source, /selectControlSurfaceBottomNavItems/);
  assert.match(source, /inventory: pathname\.startsWith\("\/inventory"\)/);
  assert.match(source, /\.slice\(0, MAX_VISIBLE_ITEMS\)/);
  assert.match(source, /aria-expanded=\{openMobile\}/);
});

test("Owner mobile shell keeps the module drawer available on the root landing", () => {
  const source = read("apps/web/app/components/app-shell.tsx");

  assert.match(
    source,
    /const showBottomNav = bottomNav && tier1WithBadges\.length > 0;/,
  );
  assert.doesNotMatch(source, /pathname !== "\/"/);
  assert.match(
    source,
    /\{showBottomNav \? \(\s*<ControlSurfaceBottomNav\s+tier1=\{tier1WithBadges\}\s+tier2=\{tier2WithBadges\}\s*\/>\s*\) : null\}/,
  );
  assert.match(
    source,
    /isTouchLayout \? "min-h-12 text-sm" : "min-h-10 text-sm"/,
  );
  assert.match(source, /useIsMobile\((?:1024|OWNER_SHELL_BREAKPOINT)\)/);
  assert.match(source, /isTouchLayout \? "min-h-12" : "min-h-10"/);
  assert.match(
    source,
    /rounded-md bg-sidebar-accent p-2 ring-1 ring-sidebar-border\/70/,
  );
  assert.match(source, /<BrandMark[\s\S]*?decorative/);
  assert.match(source, /sideOffset=\{8\}/);
  assert.match(
    source,
    /<Avatar>[\s\S]*?bg-primary font-semibold text-primary-foreground/,
  );
  assert.match(
    source,
    /<nav aria-label=\{controlSurfaceCopy\.nav\.ariaLabel\}>/,
  );
  assert.match(
    source,
    /data-active:bg-primary data-active:text-primary-foreground/,
  );
  assert.doesNotMatch(
    source,
    /<SidebarMenuButton\b[\s\S]{0,300}data-active:(?:before|after)/,
  );
  assert.match(
    source,
    /calc\(3\.5rem \+ max\(0\.5rem, env\(safe-area-inset-bottom\)\)\)/,
  );
  assert.doesNotMatch(source, /brand-pattern-caro/);
});

test("Owner AppShell keeps inset panel viewport-bounded with inner scroll", () => {
  const source = read("apps/web/app/components/app-shell.tsx");

  assert.match(source, /className="h-svh overflow-hidden"/);
  assert.match(
    source,
    /chrome-safe-pt min-h-0 overflow-hidden lg:max-h-\[calc\(100svh-1rem\)\]/,
  );
  assert.match(source, /data-control-surface=""/);
  assert.match(source, /lg:ring-1 lg:ring-sidebar-border\/50/);
  assert.match(
    source,
    /no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pt-3 md:px-4 md:pt-4/,
  );
  assert.match(source, /data-control-surface-scroll=""/);
  assert.match(source, /showBottomNav \? "pb-24 lg:pb-0" : "pb-3 md:pb-4"/);
  assert.match(source, /<AppShellPaddingBoundary>/);
  assert.match(
    source,
    /flex min-h-0 flex-1 flex-col gap-4/,
    "Owner shell content fills scrollport for docked sticky footers",
  );

  const surface = [
    "apps/web/app/components/surface/app-page.tsx",
    "apps/web/app/components/surface/app-page-header.tsx",
    "apps/web/app/components/surface/app-sticky-filter-chrome.tsx",
    "apps/web/app/components/surface/app-list-frame.tsx",
    "apps/web/app/components/surface/app-toolbar.tsx",
  ]
    .map((path) => read(path))
    .join("\n");
  // Page header scrolls with content — freezing it outside the scrollport
  // reserved empty body chrome and crushed dashboard aesthetics.
  assert.doesNotMatch(
    surface,
    /function AppPageHeader\([\s\S]*?sticky top-0 z-10 bg-background/,
  );
  assert.doesNotMatch(
    surface,
    /createPortal|OwnerPageChromeHostContext|ownsOwnerScroll/,
  );
  assert.doesNotMatch(
    surface,
    /APP_PAGE_HEADER_OFFSET_VAR|data-owner-page-chrome/,
  );
  assert.match(surface, /APP_PAGE_STICKY_FILTER_CLASSNAME/);
  assert.match(surface, /APP_PAGE_STICKY_FILTER_SHELL_BLEED_CLASSNAME/);
  assert.match(surface, /function AppStickyFilterChrome\(/);
  assert.doesNotMatch(surface, /function AppPageStickyChrome\(/);
  const listFrame = read("apps/web/app/components/surface/app-list-frame.tsx");
  assert.doesNotMatch(
    listFrame,
    /AppStickyFilterChrome/,
    "AppListFrame toolbar scrolls with content — opt into sticky via AppToolbar sticky or AppPageTabs stickyList",
  );
  assert.match(surface, /data-stuck/);
  // Negative top cancels Owner shell pt-3/md:pt-4 so stuck filters flush to
  // the inset panel top (top-0 leaves a pad gap where list rows peek above).
  assert.match(
    surface,
    /sticky top-\[-0\.75rem\] z-20 bg-background md:top-\[-1rem\]/,
  );
  assert.match(surface, /sticky\?: boolean/);
  assert.match(surface, /const applyInnerScroll = scroll && !nesting\.padded/);
});

test("Owner LIST filter bars use AppListFrame inline or intentional sticky", () => {
  const framedInline = [
    "apps/web/app/(protected)/orders/orders-client.tsx",
    "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx",
    "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
  ] as const;

  for (const path of framedInline) {
    const source = read(path);
    assert.match(
      source,
      /\bAppListFrame\b[\s\S]*?toolbar=\{[\s\S]*?<AppToolbar[\s\S]*?variant="inline"/,
      `${path} must wrap inline filters in AppListFrame toolbar slot`,
    );
    assert.doesNotMatch(
      source,
      /<AppToolbar\s+sticky/,
      `${path} must not use AppToolbar sticky — use AppListFrame toolbar slot (scrolls with content)`,
    );
  }

  const attendanceSource = readAttendanceTableModules(
    join(repoRoot, "apps/web"),
  );
  assert.match(
    attendanceSource,
    /\bAppListFrame\b[\s\S]*?toolbar=\{[\s\S]*?<AppToolbar[\s\S]*?variant="inline"/,
    "attendance LIST modules must wrap inline filters in AppListFrame toolbar slot",
  );
  assert.doesNotMatch(
    attendanceSource,
    /<AppToolbar\s+sticky/,
    "attendance modules must not use AppToolbar sticky — use AppListFrame toolbar slot (scrolls with content)",
  );

  const auditClient = read(
    "apps/web/app/(protected)/hr/staff/audit/permission-audit-client.tsx",
  );
  assert.match(
    auditClient,
    /<AppListFrame[\s\S]*?toolbar=\{[\s\S]*?<PermissionAuditFilters/,
    "permission audit LIST must frame its filter toolbar",
  );
  assert.doesNotMatch(
    read("apps/web/app/(protected)/hr/staff/audit/permission-audit-filters.tsx"),
    /<AppToolbar\s+sticky/,
  );

  // Finance FilterBar sits above KPI/dashboard cards — sticky crushes the
  // next section while scrolling. LIST pages use AppListFrame toolbar slot.
  assert.doesNotMatch(
    read("apps/web/app/(protected)/finance/components/filter-bar.tsx"),
    /<AppToolbar\s+sticky/,
  );
});

test("Owner AppToolbar filter chrome is sticky, framed, or intentionally exempt", () => {
  /** Non-filter toolbars / shared Branch-only clients — do not require sticky. */
  const allowlist = new Map<string, string>([
    [
      "apps/web/app/(protected)/orders/orders-client.tsx",
      "count/badge summary bar under sticky filters",
    ],
    [
      "apps/web/app/(protected)/orders/refunds-client.tsx",
      "action/status bar, not LIST filters",
    ],
    [
      "apps/web/app/(protected)/inventory/settings/settings-section-nav.tsx",
      "settings section nav chips, not LIST filters",
    ],
    [
      "apps/web/app/(protected)/hr/staff/staff-filters.tsx",
      "rendered only inside AppListFrame toolbar on hr-client accounts tab",
    ],
    [
      "apps/web/app/(protected)/hr/staff/audit/permission-audit-filters.tsx",
      "rendered only inside AppListFrame toolbar on permission-audit-client",
    ],
    [
      "apps/web/app/(protected)/work/_components/work-list-toolbar.tsx",
      "rendered only inside AppListFrame toolbar on work-page-shell / work-compose-shell",
    ],
    [
      "apps/web/app/(protected)/finance/components/filter-bar.tsx",
      "dashboard/KPI pages — sticky would crush sections below",
    ],
    [
      "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx",
      "listToolbar hook consumed by supplier-invoices-client AppListFrame toolbar",
    ],
    [
      "apps/web/app/(protected)/inventory/issues/issue-list-chrome.tsx",
      "list chrome hook consumed by issues-client AppListFrame toolbar slots",
    ],
    [
      "apps/web/app/(protected)/hr/attendance/attendance-calendar-host.tsx",
      "calendar REPORT mosaic — non-sticky card toolbar above AppSection",
    ],
    [
      "apps/web/app/(protected)/br/_shared/settings/pos/terminals-client.tsx",
      "Branch settings client (operator chrome), not Owner shell",
    ],
    [
      "apps/web/app/(protected)/br/_shared/settings/tables/tables-client.tsx",
      "Branch settings client (operator chrome), not Owner shell",
    ],
    [
      "apps/web/app/(protected)/br/_shared/settings/kds/stations-client.tsx",
      "Branch settings client (operator chrome), not Owner shell",
    ],
  ]);

  const protectedRoot = join(repoRoot, "apps/web/app/(protected)");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "br") continue;
        walk(full);
        continue;
      }
      if (entry.endsWith(".tsx")) files.push(full);
    }
  };
  walk(protectedRoot);

  const filterSlotToolbar = /<AppToolbar\b[\s\S]{0,400}?\b(?:filters|search)=/;
  const stickyToolbar = /<AppToolbar\b[^>]*\bsticky\b|<AppToolbar\s+sticky\b/;
  const listFrame = /\bAppListFrame\b/;
  const toolbarSlot = /\btoolbar=\{/;

  for (const abs of files) {
    const rel = toPosixPath(abs.slice(repoRoot.length + 1));
    const source = readFileSync(abs, "utf8");
    if (!filterSlotToolbar.test(source)) continue;
    if (allowlist.has(rel)) continue;

    const coveredByFrame = listFrame.test(source) && toolbarSlot.test(source);
    const coveredBySticky = stickyToolbar.test(source);
    assert.ok(
      coveredByFrame || coveredBySticky,
      `${rel} has AppToolbar search/filters but neither AppListFrame toolbar slot nor AppToolbar sticky — move into AppListFrame toolbar, opt into AppToolbar sticky, or allowlist with reason`,
    );
  }

  // Keep staff-filters pinned to the framed slot on the People accounts tab.
  const hrClient = read("apps/web/app/(protected)/hr/hr-client.tsx");
  assert.match(
    hrClient,
    /<AppListFrame[\s\S]*?toolbar=\{\s*<Suspense>\s*<StaffFilters/,
  );
  assert.doesNotMatch(
    read("apps/web/app/(protected)/hr/staff/staff-filters.tsx"),
    /<AppToolbar\s+sticky/,
  );
});

test("Owner AppPageHeader tabs slot must not embed full AppPageTabs bodies", () => {
  for (const path of [
    "apps/web/app/(protected)/orders/orders-page-body.tsx",
    "apps/web/app/(protected)/menu/page.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(
      source,
      /tabs=\{\s*<AppPageTabs[\s\S]*?<TabsContent/,
      `${path} must keep TabsContent outside AppPageHeader chrome`,
    );
  }
});

test("Owner shell scroll invariant is documented", () => {
  const designSystem = read("docs/spec/design-system.md");
  const uiModule = read("docs/modules/ui.md");
  assert.match(designSystem, /data-control-surface-scroll/);
  assert.match(designSystem, /AppPageHeader` scrolls with page\s+content/);
  assert.match(uiModule, /data-control-surface-scroll/);
  assert.match(uiModule, /AppStickyFilterChrome/);
  assert.doesNotMatch(
    uiModule,
    /AppPageStickyChrome.*compatib|compatib.*AppPageStickyChrome|compatibility alias/i,
  );
  assert.match(uiModule, /`AppPageHeader` scrolls with content/);
});

test("Inventory branch selector keeps touch targets through tablet widths", () => {
  const filter = read(
    "apps/web/app/(protected)/inventory/_components/inventory-branch-filter.tsx",
  );
  const scopeControl = read(
    "apps/web/app/components/control-surface-scope-control.tsx",
  );

  assert.match(filter, /ControlSurfaceScopeControl/);
  assert.match(scopeControl, /useIsMobile\((?:1024|OWNER_SHELL_BREAKPOINT)\)/);
  assert.match(scopeControl, /size=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(
    scopeControl,
    /className=\{isTouchLayout \? "min-h-12 text-sm" : undefined\}/,
  );
});

test("Inventory ingredient editor keeps a touch-safe unit list", () => {
  const ingredientDialog = read(
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  assert.match(ingredientDialog, /unit_ids: z/);
  assert.match(ingredientDialog, /selectedUnitIds\.map/);
  assert.doesNotMatch(ingredientDialog, /useFieldArray/);
  assert.match(ingredientDialog, /<IconTrash aria-hidden="true" \/>/);

  const issueDetail = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  assert.match(issueDetail, /useIsMobile\((?:1024|OWNER_SHELL_BREAKPOINT)\)/);
  assert.match(
    issueDetail,
    /isTouchLayout \? <div className="min-w-0">\{pageLayout\}<\/div> : pageLayout/,
  );
  assert.doesNotMatch(issueDetail, /lg:hidden">\{mobileLayout\}/);
  assert.doesNotMatch(issueDetail, /hidden lg:block">\{pageLayout\}/);
});

test("Owner page-header actions use responsive named button sizes", () => {
  const responsiveHeaderPaths = [
    "apps/web/app/(protected)/hr/hr-client.tsx",
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
    "apps/web/app/(protected)/inventory/inventory-value-panel.tsx",
    "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  ];

  const bankPage = read(
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
  );
  assert.match(
    bankPage,
    /actions=\{canLinkPayments \? <SepayImportDialog \/> : undefined\}/,
    "bank header keeps Import as the only primary action (shell owns back-nav)",
  );
  assert.doesNotMatch(
    bankPage,
    /backToFinance/,
    "bank header must not duplicate shell navigation with Quay lại Tài chính",
  );
  const importDialog = read(
    "apps/web/app/(protected)/finance/bank-transactions/sepay-import-dialog.tsx",
  );
  assert.match(
    importDialog,
    /size=\{isTouchLayout \? "touch" : "default"\}/,
    "bank Import trigger resolves touch below Owner shell cutover",
  );

  for (const path of [
    "apps/web/app/(protected)/hr/attendance/page.tsx",
    "apps/web/app/(protected)/hr/payroll/page.tsx",
    "apps/web/app/(protected)/hr/setup/page.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(
      source,
      /<ResponsiveBackButton/,
      `${path} must not duplicate shell navigation with a header Back`,
    );
    assert.doesNotMatch(
      source,
      /backToHr/,
      `${path} must not duplicate shell navigation with backToHr`,
    );
  }

  for (const path of responsiveHeaderPaths) {
    const source = read(path);
    const headerStart = source.indexOf("<AppPageHeader");
    const actionsStart = source.indexOf("actions={", headerStart);
    assert.notEqual(actionsStart, -1, `${path} must define header actions`);
    const actionBlock = source.slice(actionsStart, actionsStart + 900);
    assert.match(
      actionBlock,
      /<ResponsiveActionButton[\s\S]*density="header"|size=\{(?:isTouchLayout|controlSize === "touch") \? "touch" : "lg"\}/,
      `${path} must resolve header button touch|lg at Owner cutover`,
    );
  }

  for (const path of [
    "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx",
    "apps/web/app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
    "apps/web/app/(protected)/inventory/suppliers/suppliers-client.tsx",
  ]) {
    const source = read(path);
    const actionsStart = source.indexOf("actions={");
    assert.match(
      source.slice(actionsStart, actionsStart + 500),
      /<Button[\s\S]{0,240}size="lg"/,
      `${path} must use the page-header button size`,
    );
  }

});

test("mobile sidebar closes after link navigation", () => {
  const source = read("apps/web/app/components/sidebar.tsx");

  assert.match(source, /\.closest\("a\[href\]"\)/);
  assert.match(source, /setOpenMobile\(false\)/);
});

test("Owner list-card actions use named touch variants without enlarging desktop", () => {
  for (const path of [
    "apps/web/app/(protected)/menu/category-table.tsx",
    "apps/web/app/(protected)/menu/item-table.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /triggerSize=\{touch \? "icon-touch" : "icon"\}/);
    assert.match(source, /renderActions\([^,]+, true\)/);
  }

  const branches = read("apps/web/app/(protected)/branches/branch-table.tsx");
  assert.match(
    branches,
    /grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-3/,
  );
  assert.match(branches, /grid grid-cols-2 gap-2 border-t pt-3/);
  assert.match(branches, /href=\{`\/br\/\$\{branch\.id\}\/settings\/tables`\}/);
  assert.match(branches, /href=\{`\/br\/\$\{branch\.id\}\/feedback`\}/);
  assert.match(
    branches,
    /triggerSize=\{controlSize === "touch" \? "icon-touch" : "icon"\}/,
  );

  const employees = read("apps/web/app/(protected)/hr/employee-table.tsx");
  assert.match(employees, /triggerSize=\{touch \? "touch" : "icon-sm"\}/);
  assert.match(employees, /renderRowMenu\(employee, true\)/);
  assert.match(employees, /render: \(employee\) => renderRowMenu\(employee\)/);

  const refunds = read("apps/web/app/(protected)/orders/refunds-client.tsx");
  assert.ok(
    (refunds.match(/size=\{isTouchLayout \? "touch" : "sm"\}/g) ?? []).length >=
      2,
  );
});

test("single-Min threshold cards stay touch-safe and paginate the growth list", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
  );

  assert.match(source, /pageSize=\{25\}/);
  assert.doesNotMatch(source, /sm:grid-cols-3/);
  assert.equal(
    source.match(/h-12 text-right tabular-nums lg:h-10/g)?.length,
    2,
  );
  assert.match(
    source,
    /<Checkbox[\s\S]*size=\{isTouchLayout \? "touch" : "default"\}/,
  );
});
