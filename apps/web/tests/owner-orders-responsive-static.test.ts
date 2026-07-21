import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const ORDERS_CLIENT = "apps/web/app/(protected)/orders/orders-client.tsx";
const REFUNDS_CLIENT = "apps/web/app/(protected)/orders/refunds-client.tsx";
const ORDER_SURFACES = [ORDERS_CLIENT, REFUNDS_CLIENT];

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

test("Owner order KPI rows stay compact and expose work sooner on phones", () => {
  for (const file of ORDER_SURFACES) {
    const source = read(file);

    assert.match(source, /<KpiRow[\s\S]*density="compact"/);
    assert.match(source, /className="grid-cols-2 md:grid-cols-3"/);
    assert.match(source, /className="col-span-2 md:col-span-1"/);
    assert.equal((source.match(/density="compact"/g) ?? []).length, 4);
    assert.doesNotMatch(source, /<div className="grid gap-3 md:grid-cols-3">/);
  }
});

test("Owner finance summary exposes its operational sections sooner on phones", () => {
  const page = read(FINANCE_PAGE);
  const currentFunds = read(CURRENT_FUNDS);

  assert.match(
    page,
    /className="grid-cols-1 min-\[360px\]:grid-cols-2 xl:grid-cols-4"/,
  );
  assert.equal((page.match(/density="compact"/g) ?? []).length, 6);
  assert.match(
    currentFunds,
    /className="grid-cols-1 min-\[360px\]:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2"/,
  );
  assert.equal((currentFunds.match(/density="compact"/g) ?? []).length, 3);
});

test("Owner list and finance controls use actual touch-sized fields below desktop", () => {
  const financeFilter = read(FINANCE_FILTER);
  const currentFunds = read(CURRENT_FUNDS);
  const ingredients = read(INGREDIENTS_CLIENT);
  const dataTable = read(DATA_TABLE);

  for (const source of [financeFilter, currentFunds, ingredients]) {
    assert.match(source, /useIsMobile\(1024\)/);
  }
  assert.match(dataTable, /mobileBreakpoint = 1024/);
  assert.match(dataTable, /useIsMobile\(mobileBreakpoint\)/);

  assert.match(financeFilter, /size=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(currentFunds, /size=\{isTouchLayout \? "touch" : "sm"\}/);
  assert.match(
    ingredients,
    /<InputGroup[\s\S]{0,160}size=\{isTouchLayout \? "touch" : "field"\}/,
  );
  assert.match(
    dataTable,
    /<InputGroup[\s\S]{0,160}size=\{isTouchLayout \? "touch" : "default"\}/,
  );
  assert.doesNotMatch(dataTable, /isTouchLayout \? "h-12" : "h-7"/);
});

test("Owner order and refund controls use named touch variants below desktop", () => {
  const orders = read(ORDERS_CLIENT);
  const refunds = read(REFUNDS_CLIENT);
  const pageBody = read(ORDERS_PAGE_BODY);

  for (const source of [orders, refunds]) {
    assert.match(source, /useIsMobile\(1024\)/);
    assert.match(source, /size=\{isTouchLayout \? "touch" : "default"\}/);
  }

  assert.equal(
    (orders.match(/<InputGroup(?:\s|>)[\s\S]*?size=\{isTouchLayout/g) ?? [])
      .length,
    2,
  );
  assert.match(orders, /size=\{isTouchLayout \? "touch" : "sm"\}/);
  assert.match(refunds, /actionSize=\{isTouchLayout \? "touch" : "default"\}/);
  assert.match(pageBody, /size="touch"/);
  assert.doesNotMatch(pageBody, /size=\{embedded \? "touch" : "sm"\}/);
});

test("Ingredient Import and Export owns touch sizing for its trigger and items", () => {
  const source = read(INGREDIENT_IMPORT_EXPORT);

  assert.match(source, /useIsMobile\(1024\)/);
  assert.equal(
    (source.match(/size=\{isTouchLayout \? "touch" : "default"\}/g) ?? [])
      .length,
    5,
  );
  assert.equal(source.match(/<DropdownMenuItem/g)?.length, 4);
});

test("invoice mobile cards wrap touch actions without forcing page overflow", () => {
  const source = read("apps/web/app/(protected)/finance/invoice-list.tsx");

  assert.match(source, /const size = dense \? "icon" : "touch"/);
  assert.equal(
    source.match(/size=\{isTouchLayout \? "touch" : "sm"\}/g)?.length,
    2,
  );
  assert.match(source, /variant=\{methodFixMethod[\s\S]*size="touch"/);
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
  assert.equal(source.match(/size="touch"/g)?.length, 2);
});
