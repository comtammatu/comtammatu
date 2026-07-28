import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Owner bottom nav fits one module action and four destinations", () => {
  const source = read("apps/web/app/components/owner-bottom-nav.tsx");

  assert.match(source, /const MAX_VISIBLE_ITEMS = 4/);
  assert.equal(source.match(/min-w-14/g)?.length, 2);
  assert.doesNotMatch(source, /min-w-16/);
  assert.match(source, /visible\.slice\(0, MAX_VISIBLE_ITEMS - 1\), active/);
  assert.match(source, /const deepNavItems = flattenNavGroups\(tier2\);/);
  assert.match(source, /deepNavItems\.length > 0 \? deepNavItems : tier1/);
  assert.match(source, /aria-expanded=\{openMobile\}/);
});

test("Owner mobile shell keeps the module drawer available on the root landing", () => {
  const source = read("apps/web/app/components/app-shell.tsx");

  assert.match(source, /const showBottomNav = bottomNav;/);
  assert.doesNotMatch(source, /pathname !== "\/"/);
  assert.match(
    source,
    /\{showBottomNav \? <OwnerBottomNav tier1=\{tier1\} tier2=\{tier2\} \/> : null\}/,
  );
  assert.match(source, /<ThemeMenuItem className="min-h-12 text-sm" \/>/);
  assert.match(source, /useIsMobile\(1024\)/);
  assert.match(source, /className="min-h-12 w-full text-sm"/);
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
  assert.match(
    source,
    /flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pt-3 md:px-4 md:pt-4/,
  );
  assert.match(source, /data-owner-shell-scroll=""/);
  assert.match(source, /showBottomNav \? "pb-24 lg:pb-0" : "pb-3 md:pb-4"/);
  assert.match(source, /<AppShellPaddingBoundary>/);
  assert.match(
    source,
    /flex min-h-0 flex-1 flex-col gap-4/,
    "Owner shell content fills scrollport for docked sticky footers",
  );

  const surface = read("apps/web/app/components/surface.tsx");
  // Page header scrolls with content — freezing it outside the scrollport
  // reserved empty body chrome and crushed dashboard aesthetics.
  assert.doesNotMatch(
    surface,
    /function AppPageHeader\([\s\S]*?sticky top-0 z-10 bg-background/,
  );
  assert.doesNotMatch(surface, /createPortal|OwnerPageChromeHostContext|ownsOwnerScroll/);
  assert.doesNotMatch(surface, /APP_PAGE_HEADER_OFFSET_VAR|data-owner-page-chrome/);
  assert.match(surface, /APP_PAGE_STICKY_FILTER_CLASSNAME/);
  assert.match(surface, /function AppPageStickyChrome\(/);
  assert.match(
    surface,
    /function AppListFrame\([\s\S]*?APP_PAGE_STICKY_FILTER_CLASSNAME[\s\S]*?bg-card/,
  );
  assert.match(surface, /sticky\?: boolean/);
  assert.match(
    surface,
    /const applyInnerScroll = scroll && !nesting\.padded/,
  );
});

test("Owner sibling LIST filter bars opt into sticky stack", () => {
  const wired = [
    [
      "apps/web/app/(protected)/orders/orders-client.tsx",
      /<AppToolbar sticky className="items-end">/,
    ],
    [
      "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx",
      /<AppToolbar\s+sticky/,
    ],
    [
      "apps/web/app/(protected)/hr/attendance-table.tsx",
      /<AppToolbar\s+sticky/,
    ],
    [
      "apps/web/app/(protected)/hr/staff/audit/permission-audit-filters.tsx",
      /<AppToolbar\s+sticky/,
    ],
    [
      "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
      /<AppToolbar\s+sticky=\{isCompactLayout\}/,
    ],
  ] as const;

  for (const [path, pattern] of wired) {
    assert.match(read(path), pattern, `${path} must sticky its page filter bar`);
  }

  // Finance FilterBar sits above KPI/dashboard cards — sticky crushes the
  // next section while scrolling. LIST pages use AppListFrame toolbar sticky.
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
      "rendered only inside AppListFrame toolbar on staff/page.tsx",
    ],
    [
      "apps/web/app/(protected)/finance/components/filter-bar.tsx",
      "dashboard/KPI pages — sticky would crush sections below",
    ],
    [
      "apps/web/app/(protected)/branch-settings/_shared/pos/terminals-client.tsx",
      "Branch settings client (operator chrome), not Owner shell",
    ],
    [
      "apps/web/app/(protected)/branch-settings/_shared/tables/tables-client.tsx",
      "Branch settings client (operator chrome), not Owner shell",
    ],
    [
      "apps/web/app/(protected)/branch-settings/_shared/kds/stations-client.tsx",
      "Branch settings client (operator chrome), not Owner shell",
    ],
  ]);

  const protectedRoot = resolve(repoRoot, "apps/web/app/(protected)");
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

  const filterSlotToolbar =
    /<AppToolbar\b[\s\S]{0,400}?\b(?:filters|search)=/;
  const stickyToolbar = /<AppToolbar\b[^>]*\bsticky\b|<AppToolbar\s+sticky\b/;
  const listFrame = /\b(?:AppListFrame|InventoryListFrame)\b/;
  const toolbarSlot = /\btoolbar=\{/;

  for (const abs of files) {
    const rel = abs.slice(repoRoot.length + 1);
    const source = readFileSync(abs, "utf8");
    if (!filterSlotToolbar.test(source)) continue;
    if (allowlist.has(rel)) continue;

    const coveredByFrame = listFrame.test(source) && toolbarSlot.test(source);
    const coveredBySticky = stickyToolbar.test(source);
    assert.ok(
      coveredByFrame || coveredBySticky,
      `${rel} has AppToolbar search/filters but neither AppListFrame toolbar sticky wrap nor AppToolbar sticky — add sticky, move into AppListFrame toolbar, or allowlist with reason`,
    );
  }

  // Keep staff-filters pinned to the framed slot (double-sticky would stack wrong).
  const staffPage = read("apps/web/app/(protected)/hr/staff/page.tsx");
  assert.match(
    staffPage,
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
  assert.match(designSystem, /data-owner-shell-scroll/);
  assert.match(designSystem, /AppPageHeader` scrolls with page\s+content/);
  assert.match(uiModule, /data-owner-shell-scroll/);
  assert.match(uiModule, /AppPageStickyChrome/);
  assert.match(uiModule, /AppPageHeader` cuộn cùng nội dung/);
});

test("Inventory branch selector keeps touch targets through tablet widths", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/_components/inventory-branch-filter.tsx",
  );

  assert.match(source, /useIsMobile\(1024\)/);
  assert.match(source, /size=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(
    source,
    /className=\{isTouchLayout \? "min-h-12 text-sm" : undefined\}/,
  );
});

test("Inventory ingredient editor keeps two operational unit roles", () => {
  const ingredientDialog = read(
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  assert.match(ingredientDialog, /name="input_unit_id"/);
  assert.match(ingredientDialog, /name="output_unit_id"/);
  assert.doesNotMatch(ingredientDialog, /useFieldArray|IconTrash/);

  const issueDetail = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  assert.match(issueDetail, /useIsMobile\(1024\)/);
  assert.match(issueDetail, /isTouchLayout \? <div className="min-w-0">\{pageLayout\}<\/div> : pageLayout/);
  assert.doesNotMatch(issueDetail, /lg:hidden">\{mobileLayout\}/);
  assert.doesNotMatch(issueDetail, /hidden lg:block">\{pageLayout\}/);
});

test("Owner page-header actions use named button sizes", () => {
  const touchPaths = [
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
    "apps/web/app/(protected)/hr/attendance/page.tsx",
    "apps/web/app/(protected)/hr/hr-client.tsx",
    "apps/web/app/(protected)/hr/payroll/page.tsx",
    "apps/web/app/(protected)/hr/setup/page.tsx",
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
    "apps/web/app/(protected)/inventory/inventory-value-panel.tsx",
    "apps/web/app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
  ];

  for (const path of touchPaths) {
    const source = read(path);
    const headerStart = source.indexOf("<AppPageHeader");
    const actionsStart = source.indexOf("actions={", headerStart);
    assert.notEqual(actionsStart, -1, `${path} must define header actions`);
    const actionBlock = source.slice(actionsStart, actionsStart + 900);
    assert.match(
      actionBlock,
      /<Button[\s\S]{0,240}size="touch"/,
      `${path} must size its header button for touch`,
    );
  }

  for (const path of [
    "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx",
    "apps/web/app/(protected)/inventory/recipes/recipes-client.tsx",
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

  const grnCreate = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );
  const grnActionsStart = grnCreate.indexOf("actions={");
  const grnActionBlock = grnCreate.slice(
    grnActionsStart,
    grnActionsStart + 600,
  );
  assert.doesNotMatch(grnActionBlock, /\bh-8\b/);
});

test("mobile sidebar closes after link navigation", () => {
  const source = read("packages/ui/src/components/sidebar.tsx");

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
    /grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4/,
  );
  assert.match(branches, /grid grid-cols-2 gap-2 border-t pt-3/);
  assert.match(branches, /href=\{`\/br\/\$\{branch\.id\}\/settings\/tables`\}/);
  assert.match(branches, /feedbackComingSoonTitle/);

  const employees = read("apps/web/app/(protected)/hr/employee-table.tsx");
  assert.match(employees, /size=\{touch \? "touch" : "sm"\}/);
  assert.match(employees, /renderEdit\(employee, true\)/);
  assert.match(employees, /render: \(employee\) => renderEdit\(employee\)/);

  const refunds = read("apps/web/app/(protected)/orders/refunds-client.tsx");
  assert.equal(refunds.match(/size="touch"/g)?.length, 2);
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
  assert.match(source, /<Checkbox[\s\S]*size="touch"/);
});
