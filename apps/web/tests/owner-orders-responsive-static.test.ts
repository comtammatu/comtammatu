import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const ORDERS_CLIENT = "apps/web/app/(protected)/orders/orders-client.tsx";
const REFUNDS_CLIENT = "apps/web/app/(protected)/orders/refunds-client.tsx";
const _ORDER_SURFACES = [ORDERS_CLIENT, REFUNDS_CLIENT];

const FINANCE_PAGE = "apps/web/app/(protected)/finance/page.tsx";
const CURRENT_FUNDS =
  "apps/web/app/(protected)/finance/components/current-funds-section.tsx";
const FINANCE_FILTER =
  "apps/web/app/(protected)/finance/components/filter-bar.tsx";
const INGREDIENTS_CLIENT =
  "apps/web/app/(protected)/inventory/ingredients/ingredients-client.tsx";
const DATA_TABLE = "apps/web/app/components/data-table/data-table.tsx";
const ORDERS_PAGE_BODY = "apps/web/app/(protected)/orders/orders-page-body.tsx";
const INGREDIENT_IMPORT_EXPORT =
  "apps/web/app/(protected)/inventory/ingredients/import-export-menu.tsx";

test("Owner order LIST pages have no KPI mosaic", () => {
  const orders = read(ORDERS_CLIENT);
  const refunds = read(REFUNDS_CLIENT);

  assert.doesNotMatch(orders, /\bKpiRow\b/);
  assert.doesNotMatch(orders, /\bKpiCard\b/);
  assert.match(orders, /<AppListFrame/);
  assert.doesNotMatch(orders, /<div className="grid gap-3 md:grid-cols-3">/);

  assert.doesNotMatch(refunds, /\bKpiRow\b/);
  assert.doesNotMatch(refunds, /\bKpiCard\b/);
  assert.match(refunds, /<AppListFrame/);
  assert.match(refunds, /<AppToolbar[\s\S]{0,80}variant="inline"/);
  assert.doesNotMatch(refunds, /<div className="grid gap-3 md:grid-cols-3">/);
});

test("Owner finance results stay one column on mobile, two on tablet, and expose the formula on wide screens", () => {
  const page = read(FINANCE_PAGE);
  const currentFunds = read(CURRENT_FUNDS);

  assert.match(
    page,
    /xl:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)_auto_minmax\(0,1fr\)/,
  );
  assert.equal(
    (page.match(/className=\{formulaOperatorClass\}/g) ?? []).length,
    8,
  );
  assert.match(
    currentFunds,
    /xl:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/,
  );
  assert.equal(
    (currentFunds.match(/className=\{formulaOperatorClass\}/g) ?? []).length,
    2,
  );
  assert.equal((currentFunds.match(/density="compact"/g) ?? []).length, 7);
});

test("Owner list and finance controls use actual touch-sized fields below desktop", () => {
  const financeFilter = read(FINANCE_FILTER);
  const currentFunds = read(CURRENT_FUNDS);
  const ingredients = read(INGREDIENTS_CLIENT);
  const dataTable = read(DATA_TABLE);

  assert.match(financeFilter, /useFormControlSize\(\)/);
  assert.match(currentFunds, /useIsMobile\((?:1024|OWNER_SHELL_BREAKPOINT)\)/);
  assert.match(ingredients, /useIsMobile\((?:1024|OWNER_SHELL_BREAKPOINT)\)/);
  assert.match(ingredients, /useFormControlSize\(\)/);
  assert.match(dataTable, /mobileBreakpoint = 1024/);
  assert.match(dataTable, /useIsMobile\(mobileBreakpoint\)/);

  assert.match(financeFilter, /size=\{controlSize\}/);
  assert.match(currentFunds, /size=\{isTouchLayout \? "touch" : "sm"\}/);
  assert.match(
    ingredients,
    /<InputGroup[\s\S]{0,160}size=\{isTouchLayout \? "touch" : "field"\}/,
  );
  assert.match(
    dataTable,
    /const controlSize = isTouchLayout \? "touch" : "field"/,
  );
  assert.match(dataTable, /<InputGroup[\s\S]{0,160}size=\{controlSize\}/);
  assert.doesNotMatch(dataTable, /isTouchLayout \? "h-12" : "h-7"/);
});

test("Owner order and refund controls use named touch variants below desktop", () => {
  const orders = read(ORDERS_CLIENT);
  const refunds = read(REFUNDS_CLIENT);
  const pageBody = read(ORDERS_PAGE_BODY);

  assert.match(orders, /useFormControlSize\(\)/);
  assert.match(refunds, /useIsMobile\((?:1024|OWNER_SHELL_BREAKPOINT)\)/);
  assert.match(orders, /size=\{controlSize\}/);
  assert.match(
    orders,
    /size=\{controlSize === "touch" \? "touch" : "default"\}/,
  );
  assert.match(refunds, /size=\{isTouchLayout \? "touch" : "default"\}/);

  assert.match(orders, /size=\{controlSize\}/);
  assert.match(refunds, /actionSize=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(pageBody, /<ResponsiveActionButton[\s\S]*density="header"/);
  assert.doesNotMatch(pageBody, /size=\{embedded \? "touch" : "sm"\}/);
});

test("Ingredients no longer exposes Import and Export", () => {
  assert.equal(existsSync(resolve(repoRoot, INGREDIENT_IMPORT_EXPORT)), false);
  assert.doesNotMatch(read(INGREDIENTS_CLIENT), /IngredientImportExportMenu/);
});

test("invoice mobile cards wrap touch actions without forcing page overflow", () => {
  const source = read("apps/web/app/(protected)/finance/invoice-list.tsx");

  assert.match(source, /const size = dense \? "icon" : isTouchLayout \? "touch" : "default"/);
  assert.match(source, /<ResponsiveActionButton/);
  assert.match(
    source,
    /variant=\{methodFixMethod[\s\S]*size=\{isTouchLayout \? "touch" : "default"\}/,
  );
  assert.match(source, /flex flex-wrap items-center justify-end gap-2/);
  assert.match(
    source,
    /ItemFooter className="mt-4 w-full flex-col items-stretch sm:flex-row sm:items-center"/,
  );
  assert.match(source, /break-all font-mono text-sm/);
});

test("finance report actions and period cards stay touch-safe below desktop", () => {
  const exportActions = read(
    "apps/web/app/(protected)/finance/components/export-toolbar.tsx",
  );
  const staleness = read(
    "apps/web/app/(protected)/finance/components/mv-staleness-banner.tsx",
  );
  const revenue = read(
    "apps/web/app/(protected)/finance/revenue/revenue-client.tsx",
  );

  assert.equal(
    exportActions.match(/size=\{isTouchLayout \? "touch" : "sm"\}/g)?.length,
    2,
  );
  assert.match(staleness, /size=\{isTouchLayout \? "touch" : "sm"\}/);
  assert.doesNotMatch(staleness, /className="h-7/);
  assert.match(
    revenue,
    /render=\{href \? <Link href=\{href\} \/> : undefined\}/,
  );
});

test("expense primary and dialog actions use the touch contract", () => {
  const source = read(
    "apps/web/app/(protected)/finance/expenses/expenses-client.tsx",
  );

  assert.match(source, /size=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(source, /size=\{actionSize\}/);
  assert.ok(
    (source.match(/size=\{actionSize\}/g) ?? []).length >= 5,
    "expense row and dialog actions must use actionSize",
  );
});
