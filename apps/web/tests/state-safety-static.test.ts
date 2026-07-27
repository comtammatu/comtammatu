import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hasLongPressMoved } from "../lib/hooks/use-long-press";

function read(path: string): string {
  return readFileSync(
    join(process.cwd(), path.replace(/^apps\/web\//, "")),
    "utf8",
  );
}

test("long press movement cancellation uses both axes and preserves the threshold edge", () => {
  const start = { x: 10, y: 10 };

  assert.equal(hasLongPressMoved(start, { x: 20, y: 10 }, 10), false);
  assert.equal(hasLongPressMoved(start, { x: 21, y: 10 }, 10), true);
  assert.equal(hasLongPressMoved(start, { x: 10, y: -1 }, 10), true);
});

test("long press cancels click after movement and exposes keyboard activation", () => {
  const hook = read("apps/web/lib/hooks/use-long-press.ts");

  assert.match(hook, /const isCancelledRef = useRef\(false\)/);
  assert.match(
    hook,
    /isCancelledRef\.current = true;\s*startPosRef\.current = null;/,
  );
  assert.match(
    hook,
    /const shouldClick =\s*startPosRef\.current !== null &&\s*!isCancelledRef\.current &&\s*!isLongPressTriggeredRef\.current;/,
  );
  assert.match(hook, /e\.key === "Enter"/);
  assert.match(hook, /e\.key === " "/);
  assert.match(hook, /role: onClick \? "button" : undefined/);
  assert.match(hook, /tabIndex: onClick \? 0 : undefined/);
});

test("long press cards preserve vertical scrolling and composed swipe cards keep keyboard handlers", () => {
  const touchCardPaths = [
    "apps/web/app/(protected)/hr/shifts-table.tsx",
    "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  ];

  for (const path of touchCardPaths) {
    const source = read(path);
    assert.match(source, /touch-pan-y/);
    assert.doesNotMatch(source, /touch-none/);
  }

  for (const path of [
    "apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx",
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /<InteractiveCard\s+render=\{<Link href=/);
    assert.doesNotMatch(source, /useLongPress/);
    assert.doesNotMatch(source, /<Drawer/);
  }

  const stocktake = read(
    "apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  assert.match(stocktake, /size="icon-touch"/);
  assert.match(stocktake, /onClick=\{\(\) => onOpenDrawer\(row\)\}/);

  for (const path of [
    "apps/web/lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-table.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /onKeyDown: longPress\.onKeyDown/);
    assert.match(source, /onKeyUp: longPress\.onKeyUp/);
    assert.match(source, /tabIndex: longPress\.tabIndex/);
  }
});

test("FormDialog resets only on open or entity transitions and confirms dirty dismissal locally", () => {
  const source = read("apps/web/app/components/form/form-dialog.tsx");

  assert.match(source, /const justOpened = open && !wasOpenRef\.current/);
  assert.match(source, /const entityChanged =/);
  assert.match(
    source,
    /if \(justOpened \|\| entityChanged\) \{\s*form\.reset\(defaultValues\)/,
  );
  assert.doesNotMatch(source, /if \(open\) \{\s*form\.reset\(defaultValues\)/);
  assert.match(source, /const isDirty = form\.formState\.isDirty;/);
  assert.match(source, /if \(\s*isPending \|\|/);
  assert.match(source, /if \(!isDirty\)/);
  assert.doesNotMatch(source, /await confirm\(/);
  assert.match(
    source,
    /const \[discardConfirmationOpen, setDiscardConfirmationOpen\] = useState\(false\)/,
  );
  assert.doesNotMatch(source, /discardConfirmedRef/);
  assert.match(source, /setDiscardConfirmationOpen\(true\)/);
  assert.match(
    source,
    /<Dialog\s+open=\{open\}\s+onOpenChange=\{handleOpenChange\}\s+disablePointerDismissal=\{isPending\}\s*>[\s\S]*?<ConfirmDialog\s+open=\{discardConfirmationOpen\}/,
  );
  assert.match(source, /<\/Dialog>\s*<ConfirmDialog/);
  assert.match(source, /<DialogContent[\s\S]*?showCloseButton=\{!isPending\}/);
  assert.match(source, /<form[\s\S]*?aria-busy=\{isPending\}/);
  assert.match(source, /onClick=\{requestClose\}/);
  assert.match(source, /actionSize = "touch"/);
  assert.equal(source.match(/size=\{actionSize\}/g)?.length, 2);
});

test("writable settings and finance pages fail closed when initial data cannot load", () => {
  const general = read(
    "apps/web/app/(protected)/settings/(tenant)/general/page.tsx",
  );
  const payments = read(
    "apps/web/app/(protected)/settings/(tenant)/payments/page.tsx",
  );
  const foodCost = read("apps/web/app/(protected)/finance/food-cost/page.tsx");
  const categories = read(
    "apps/web/app/(protected)/inventory/settings/categories/page.tsx",
  );
  const units = read(
    "apps/web/app/(protected)/inventory/settings/units/page.tsx",
  );
  const thresholds = read(
    "apps/web/app/(protected)/inventory/settings/thresholds/page.tsx",
  );

  assert.match(general, /data: tenant, error/);
  assert.match(general, /tenantError \|\| invoiceProfileError \|\| !identity/);
  assert.match(payments, /data: rows, error/);
  assert.match(payments, /\{error \? \(/);
  assert.match(foodCost, /const loadFailed =/);
  assert.match(foodCost, /!branchesRes\.success/);
  assert.match(foodCost, /!foodRes\.success/);
  assert.match(foodCost, /!actualRes\.success/);
  assert.match(foodCost, /!revenueRes\.success/);
  assert.match(categories, /\{res\.success \? \(/);
  assert.match(units, /\{res\.success \? \(/);
  assert.match(thresholds, /!res\.success \? \(/);

  for (const source of [
    general,
    payments,
    foodCost,
    categories,
    units,
    thresholds,
  ]) {
    assert.match(source, /<AppEmptyState/);
    assert.match(source, /mode="error"/);
  }
});

test("Inventory document and approval workflows fail closed on incomplete source data", () => {
  const stocktakeStart = read(
    "apps/web/app/(protected)/inventory/stocktake/new/page.tsx",
  );
  const wasteApprovalsPage = read(
    "apps/web/app/(protected)/inventory/waste/approvals/page.tsx",
  );
  const wasteApprovalsClient = read(
    "apps/web/app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );
  const wasteNew = read(
    "apps/web/app/(protected)/inventory/waste/new/page.tsx",
  );

  assert.match(stocktakeStart, /loadFailed=\{locationsRes\.error !== null\}/);
  assert.match(wasteApprovalsPage, /loadFailed=\{data\.loadFailed\}/);
  assert.match(wasteApprovalsClient, /loadFailed \? \(/);
  assert.match(wasteApprovalsClient, /mode="error"/);
  for (const source of [
    /branchRes\.error/,
    /locationsRes\.error/,
    /ingredientsRes\.error/,
    /stockLevelsError/,
    /!capRes\.success/,
    /!capRes\.data/,
  ]) {
    assert.match(wasteNew, source);
  }
  assert.match(wasteNew, /mode: "error"/);
  assert.doesNotMatch(wasteNew, /shiftCap: 1_500_000/);
});

test("Inventory lists and reports do not render load failures as empty data", () => {
  const routes = [
    ["ingredients/page.tsx", "inventory.ingredients.load_failed"],
    ["suppliers/page.tsx", "inventory.suppliers.load_failed"],
    ["transfers/page.tsx", "inventory.transfers.load_failed"],
    ["stocktake/page.tsx", "inventory.stocktake.load_failed"],
    ["production/page.tsx", "inventory.production.load_failed"],
    ["supplier-invoices/page.tsx", "inventory.supplier_invoices.load_failed"],
    ["issues/page.tsx", "inventory.issues.load_failed"],
    ["reports/page.tsx", "inventory.reports.load_failed"],
    ["count-assignments/page.tsx", "inventory.count_assignments.load_failed"],
    ["count-slips/page.tsx", "inventory.count_slips.load_failed"],
  ] as const;

  for (const [route, errorCode] of routes) {
    const source = read(`apps/web/app/(protected)/inventory/${route}`);
    assert.match(
      source,
      new RegExp(`throw new Error\\("${errorCode.replaceAll(".", "\\.")}"\\)`),
      route,
    );
  }
});

test("Owner sticky detail footer reserves the fixed bottom navigation", () => {
  const shell = read("apps/web/app/components/app-shell.tsx");
  const surface = read("apps/web/app/components/surface.tsx");

  assert.match(shell, /"--app-bottom-nav-offset":/);
  assert.match(
    shell,
    /calc\(3\.5rem \+ max\(0\.5rem, env\(safe-area-inset-bottom\)\)\)/,
  );
  assert.match(surface, /bottom-\[var\(--app-bottom-nav-offset,0px\)\]/);
  assert.match(surface, /lg:bottom-0/);
});
