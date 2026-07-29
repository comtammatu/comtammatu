import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// DataTable owns client-side paging when `pageSize` is set without
// `totalCount`. Two contracts must hold: the adapter slices (callers pass the
// full array), and row callbacks still receive the ABSOLUTE index — inline
// line-edit sheets patch by index and would corrupt lines past page 1
// otherwise.

const source = readFileSync(
  join(import.meta.dirname, "../app/components/data-table/data-table.tsx"),
  "utf8",
);
const paginationSource = readFileSync(
  join(
    import.meta.dirname,
    "../app/components/data-table/data-table-pagination.tsx",
  ),
  "utf8",
);

test("adapter slices only when totalCount does not signal server paging", () => {
  assert.match(source, /pageSize != null && totalCount == null/);
  assert.match(source, /data\.slice\(pageOffset, pageOffset \+/);
});

test("both render planes map the sliced page, never the full array", () => {
  const pagedMaps = source.match(/pagedData\.map\(/g) ?? [];
  assert.equal(pagedMaps.length, 2, "mobile card list + desktop table body");
  assert.doesNotMatch(source, /\n\s*data\.map\(/);
});

test("row callbacks receive the absolute index across pages", () => {
  assert.match(source, /index \+ pageOffset/);
  assert.match(source, /const index = sliceIndex \+ pageOffset/);
});

test("page derives clamped so a shrinking filter result cannot strand the view", () => {
  assert.match(
    source,
    /Math\.min\(currentPage \?\? internalPage, totalPages\)/,
  );
});

test("blank action headers retain an accessible table heading", () => {
  assert.match(source, /col\.header === ""/);
  assert.match(source, /FORM_VI\.action/);
  assert.doesNotMatch(source, /hideOnMobile/);
});

test("responsive tables follow the Owner touch-shell breakpoint by default", () => {
  assert.match(source, /mobileBreakpoint = 1024/);
  assert.match(source, /const isTouchLayout = useIsMobile\(mobileBreakpoint\)/);
  assert.match(
    source,
    /const isMobile = isTouchLayout && mobileCardRender != null/,
  );
});

test("table toolbar controls use touch sizing on mobile and tablet", () => {
  assert.match(
    source,
    /const controlSize = isTouchLayout \? "touch" : "field"/,
  );
  assert.match(source, /<InputGroup[\s\S]{0,160}size=\{controlSize\}/);
  assert.doesNotMatch(source, /isTouchLayout \? "h-12" : "h-7"/);
  assert.doesNotMatch(
    source,
    /size=\{isTouchLayout \? "touch" : "default"\}/,
  );
  assert.match(
    source,
    /size=\{controlSize === "touch" \? "touch" : "default"\}/,
  );
  assert.match(source, /type="search"/);
  assert.match(
    source,
    /aria-label=\{searchPlaceholder \?\? ACTIONS_VI\.search\}/,
  );
  assert.equal(source.match(/touch=\{isTouchLayout\}/g)?.length, 2);
  assert.match(paginationSource, /touch \? "icon-touch" : "icon-sm"/);
});

test("uncontrolled inline filters reset paging before applying a new query", () => {
  assert.match(source, /function handleSearchValueChange/);
  assert.match(source, /function handleFilterValueChange/);
  assert.equal(
    source.match(/currentPage == null\) setInternalPage\(1\)/g)?.length,
    2,
  );
  assert.match(source, /handleSearchValueChange\(event\.target\.value\)/);
  assert.match(source, /handleFilterValueChange\(filter\.key, value\)/);
});

test("growth lists opted in", () => {
  for (const rel of [
    "../app/(protected)/orders/orders-client.tsx",
    "../app/(protected)/orders/refunds-client.tsx",
    "../app/(protected)/inventory/grn/grn-list-client.tsx",
    "../app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx",
    "../app/(protected)/settings/printers/jobs/print-jobs-client.tsx",
    "../app/(protected)/hr/staff/audit/permission-audit-table.tsx",
  ]) {
    const client = readFileSync(join(import.meta.dirname, rel), "utf8");
    assert.match(client, /pageSize=\{50\}/, rel);
  }

  const ingredients = readFileSync(
    join(
      import.meta.dirname,
      "../app/(protected)/inventory/ingredients/ingredients-client.tsx",
    ),
    "utf8",
  );
  assert.match(ingredients, /pageSize=\{25\}/);
  assert.match(ingredients, /currentPage=\{currentPage\}/);
  assert.match(ingredients, /onPageChange=\{setCurrentPage\}/);
  assert.match(ingredients, /useFormControlSize\(\)/);
  assert.match(ingredients, /size=\{controlSize\}/);

  for (const [rel, pageSize] of [
    ["../app/(protected)/finance/expenses/expenses-client.tsx", 50],
    ["../app/(protected)/finance/revenue/[date]/revenue-drill-tabs.tsx", 50],
    ["../app/(protected)/hr/attendance-table.tsx", 50],
    ["../app/(protected)/hr/employee-table.tsx", 25],
    ["../app/(protected)/hr/leave-requests-table.tsx", 25],
    ["../app/(protected)/hr/staff/staff-table.tsx", 25],
    ["../app/(protected)/inventory/count-slips/count-slips-client.tsx", 50],
    ["../app/(protected)/inventory/production/production-runs-client.tsx", 50],
    ["../app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx", 25],
    ["../app/(protected)/inventory/stock/stock-client.tsx", 25],
    ["../app/(protected)/inventory/stocktake/stocktake-list-client.tsx", 50],
    ["../app/(protected)/inventory/suppliers/suppliers-client.tsx", 25],
    ["../app/(protected)/inventory/transfers/transfers-list-client.tsx", 50],
    ["../app/(protected)/menu/item-table.tsx", 25],
  ] as const) {
    const client = readFileSync(join(import.meta.dirname, rel), "utf8");
    assert.match(client, new RegExp(`pageSize=\\{${pageSize}\\}`), rel);
  }

  const issues = readFileSync(
    join(
      import.meta.dirname,
      "../app/(protected)/inventory/issues/issues-client.tsx",
    ),
    "utf8",
  );
  assert.equal(issues.match(/pageSize=\{50\}/g)?.length, 2);
});
