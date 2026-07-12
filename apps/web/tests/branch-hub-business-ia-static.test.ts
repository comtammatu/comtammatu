import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const operatorRoot = "apps/web/app/(protected)/br/[branchId]/(operator)";

function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

test("Tồn opens actual on-hand data instead of a feature directory", () => {
  const stockPage = read(`${operatorRoot}/stock/page.tsx`);
  const stockAlias = read(`${operatorRoot}/stock/on-hand/page.tsx`);
  const stockClient = read(
    `${operatorRoot}/stock/on-hand/branch-stock-on-hand-client.tsx`,
  );
  const bottomNav = read(`${operatorRoot}/operator-bottom-nav.tsx`);

  assert.match(stockPage, /loadStockOnHandPageData/);
  assert.match(stockPage, /<BranchStockOnHandClient/);
  assert.doesNotMatch(stockPage, /resolveOperatorTiles|STOCK_PRIMARY_SUFFIXES/);
  assert.match(stockAlias, /\["category", "location", "q", "status"\]/);
  assert.match(
    stockAlias,
    /redirect\(`\/br\/\$\{branchId\}\/stock\$\{suffix\}`\)/,
  );
  assert.match(bottomNav, /tab: "stock"[\s\S]*?label: "Tồn"/);
  assert.match(bottomNav, /resolveOperatorTab\(pathname\)/);
  assert.doesNotMatch(bottomNav, /isNavItemActive/);
  assert.match(stockClient, /useSearchParams\(\)/);
  assert.match(stockClient, /window\.history\.replaceState/);
});

test("Nay is the only Branch command home", () => {
  const dashboard = read(`${operatorRoot}/dashboard/page.tsx`);
  const layout = read(`${operatorRoot}/layout.tsx`);
  const home = read(`${operatorRoot}/page.tsx`);

  assert.match(dashboard, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(layout, /\/dashboard|IconLayoutDashboard/);
  assert.match(home, /<HubReadinessSection/);
});

test("personal count and manager assignments have one canonical job route", () => {
  const shift = read(`${operatorRoot}/shift/page.tsx`);
  const countAlias = read(`${operatorRoot}/stock/count/page.tsx`);
  const countPage = read(`${operatorRoot}/shift/count/page.tsx`);
  const assignmentAlias = read(
    `${operatorRoot}/stock/count-assignments/page.tsx`,
  );
  const itemDetail = read(
    `${operatorRoot}/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx`,
  );

  assert.match(shift, /count: `\/br\/\$\{branchId\}\/shift\/count`/);
  assert.match(countAlias, /redirect\(`\/br\/\$\{branchId\}\/shift\/count/);
  assert.match(
    countAlias,
    /\?location=\$\{encodeURIComponent\(location\)\}/,
  );
  assert.match(
    countPage,
    /baseHref=\{`\/br\/\$\{branchId\}\/shift\/count`\}/,
  );
  assert.match(
    itemDetail,
    /href: `\/br\/\$\{data\.branchId\}\/shift\/count`/,
  );
  assert.match(
    assignmentAlias,
    /new URLSearchParams\(\{ tab: "assignments" \}\)/,
  );
  assert.match(assignmentAlias, /"locationId", "shiftId"/);
  assert.match(assignmentAlias, /if \(value\) target\.set\(key, value\)/);
  assert.match(
    assignmentAlias,
    /redirect\(`\/br\/\$\{branchId\}\/team\?\$\{target\.toString\(\)\}`\)/,
  );
});

test("retired transfer and dead recipe entries stay out of Branch daily IA", () => {
  const queue = read(`${operatorRoot}/_components/hub/hub-queue-section.tsx`);
  const itemDetail = read(
    `${operatorRoot}/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx`,
  );
  const productionCreate = read(
    `${operatorRoot}/stock/production/new/branch-production-new-client.tsx`,
  );

  assert.doesNotMatch(queue, /inboundTransfers|\/stock\/receive/);
  assert.doesNotMatch(itemDetail, /key: "transfer"|\/transfer/);
  assert.doesNotMatch(productionCreate, /\/recipes/);
});

test("stock screens expose one page identity instead of a second mobile header", () => {
  const stockRoot = resolve(repoRoot, `${operatorRoot}/stock`);

  for (const file of sourceFiles(stockRoot)) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /<BranchOperatorControlBar/,
      file,
    );
  }
});

test("settings flows preserve an explicit Branch back path", () => {
  const settingsRoot = `${operatorRoot}/settings`;

  assert.match(
    read(`${settingsRoot}/page.tsx`),
    /backHref=\{`\/br\/\$\{branchId\}`\}/,
  );
  for (const child of ["pos", "printers", "tables"]) {
    assert.match(
      read(`${settingsRoot}/${child}/page.tsx`),
      /backHref=\{`\/br\/\$\{branchId\}\/settings`\}/,
      child,
    );
  }
});

test("Branch list context lives in URLs and survives detail navigation", () => {
  const stockClient = read(
    `${operatorRoot}/stock/on-hand/branch-stock-on-hand-client.tsx`,
  );
  const stockDetail = read(
    `${operatorRoot}/stock/on-hand/[ingredientId]/page.tsx`,
  );

  assert.match(stockClient, /returnTo=\$\{encodeURIComponent\(returnTo\)\}/);
  assert.match(stockDetail, /getSafeInternalReturnTo/);
  assert.match(stockDetail, /backHref=\{backHref\}/);

  for (const path of [
    "stock/grn/branch-grn-list-client.tsx",
    "stock/issues/branch-stock-issues-list-client.tsx",
    "stock/consumption/branch-consumption-list-client.tsx",
    "stock/count-slips/branch-count-slips-client.tsx",
  ]) {
    assert.match(read(`${operatorRoot}/${path}`), /useOperatorUrlState/);
  }
});

test("bottom navigation cannot silently discard waste drafts", () => {
  const bottomNav = read("apps/web/app/components/app-bottom-nav.tsx");
  const waste = read(`${operatorRoot}/stock/waste/branch-waste-create-client.tsx`);
  const approvals = read(
    `${operatorRoot}/stock/waste-approvals/branch-waste-approvals-client.tsx`,
  );

  assert.match(bottomNav, /data-app-bottom-nav/);
  for (const source of [waste, approvals]) {
    assert.match(source, /nav\[data-app-bottom-nav\] a\[href\]/);
    assert.match(source, /document\.addEventListener\("click"/);
    assert.match(
      source,
      /const confirmed = await confirm\([\s\S]*?if \(confirmed\) router\.push\(href\)/,
    );
  }
});
