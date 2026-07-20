import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Owner bottom nav fits one module action and four destinations", () => {
  const source = read("apps/web/app/components/owner-bottom-nav.tsx");

  assert.match(source, /const MAX_VISIBLE_ITEMS = 4/);
  assert.equal(source.match(/min-w-14/g)?.length, 2);
  assert.doesNotMatch(source, /min-w-16/);
  assert.match(source, /visible\.slice\(0, MAX_VISIBLE_ITEMS - 1\), active/);
  assert.match(source, /aria-expanded=\{openMobile\}/);
});

test("Owner mobile shell controls meet the touch target contract", () => {
  const source = read("apps/web/app/components/app-shell.tsx");

  assert.match(
    source,
    /\{showBottomNav \? <OwnerBottomNav tier1=\{tier1\} tier2=\{tier2\} \/> : null\}/,
  );
  assert.match(
    source,
    /<ThemeMenuItem className="min-h-12 text-sm" \/>/,
  );
  assert.match(source, /useIsMobile\(1024\)/);
  assert.match(source, /className="min-h-12 w-full text-sm"/);
  assert.match(
    source,
    /calc\(3\.5rem \+ max\(0\.5rem, env\(safe-area-inset-bottom\)\)\)/,
  );
  assert.doesNotMatch(source, /brand-pattern-caro/);
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

test("Inventory mobile controls render one interactive tree with named touch sizes", () => {
  const ingredientDialog = read(
    "apps/web/app/(protected)/inventory/ingredients/ingredient-dialog.tsx",
  );
  assert.match(
    ingredientDialog,
    /size="icon-touch"[\s\S]{0,180}className="md:hidden flex-shrink-0"/,
  );
  assert.doesNotMatch(ingredientDialog, /className="h-9 w-9 md:hidden/);

  const issueDetail = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  assert.match(issueDetail, /useIsMobile\(1024\)/);
  assert.match(
    issueDetail,
    /const content = isTouchLayout \? mobileLayout : pageLayout;/,
  );
  assert.doesNotMatch(issueDetail, /lg:hidden">\{mobileLayout\}/);
  assert.doesNotMatch(issueDetail, /hidden lg:block">\{pageLayout\}/);
});

test("Owner page-header actions use the named touch button size", () => {
  const paths = [
    "apps/web/app/(protected)/finance/bank-transactions/page.tsx",
    "apps/web/app/(protected)/hr/attendance/page.tsx",
    "apps/web/app/(protected)/hr/hr-client.tsx",
    "apps/web/app/(protected)/hr/payroll/page.tsx",
    "apps/web/app/(protected)/hr/setup/page.tsx",
    "apps/web/app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
    "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx",
    "apps/web/app/(protected)/inventory/inventory-value-panel.tsx",
    "apps/web/app/(protected)/inventory/recipes/recipes-client.tsx",
    "apps/web/app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
    "apps/web/app/(protected)/inventory/suppliers/suppliers-client.tsx",
  ];

  for (const path of paths) {
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

  const grnCreate = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );
  const grnActionsStart = grnCreate.indexOf("actions={");
  const grnActionBlock = grnCreate.slice(grnActionsStart, grnActionsStart + 600);
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
  assert.match(branches, /triggerSize=\{touch \? "icon-touch" : "icon-lg"\}/);
  assert.match(branches, /renderBranchActions\(branch, true\)/);
  assert.doesNotMatch(branches, /function BranchActions|<BranchActions/);

  const employees = read("apps/web/app/(protected)/hr/employee-table.tsx");
  assert.match(employees, /size=\{touch \? "touch" : "sm"\}/);
  assert.match(employees, /renderEdit\(employee, true\)/);
  assert.match(employees, /render: \(employee\) => renderEdit\(employee\)/);

  const refunds = read("apps/web/app/(protected)/orders/refunds-client.tsx");
  assert.equal(refunds.match(/size="touch"/g)?.length, 2);
});

test("threshold cards stack fields on phones and paginate the growth list", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
  );

  assert.match(source, /pageSize=\{25\}/);
  assert.equal(
    source.match(/grid grid-cols-1 gap-3 sm:grid-cols-3/g)?.length,
    2,
  );
  assert.equal(
    source.match(/h-12 text-right tabular-nums lg:h-10/g)?.length,
    6,
  );
  assert.match(source, /<Checkbox[\s\S]*size="touch"/);
});
