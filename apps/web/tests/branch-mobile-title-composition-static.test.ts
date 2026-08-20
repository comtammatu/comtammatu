import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function findTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function toRepoPath(absPath: string): string {
  const index = absPath.lastIndexOf("apps/web/");
  if (index >= 0) return absPath.slice(index + "apps/web/".length);
  return absPath;
}

test("BranchOperatorPage keeps hideHeaderOnMobile as an optional adapter API", () => {
  const source = read(
    "lib/branch-operator/components/branch-operator-page.tsx",
  );

  assert.match(source, /hideHeaderOnMobile\?: boolean/);
  assert.match(
    source,
    /className=\{hideHeaderOnMobile \? "max-sm:sr-only" : undefined\}/,
  );
  assert.doesNotMatch(source, /className=\{hideHeaderOnMobile \? "hidden"/);
  assert.match(source, /compactOnMobile=\{hideHeaderOnMobile\}/);
});

test("BranchOperatorPage only height-fills when fill is opted in", () => {
  const source = read(
    "lib/branch-operator/components/branch-operator-page.tsx",
  );
  assert.match(source, /fill\?: boolean/);
  assert.match(
    source,
    /fill && "min-h-0 flex-1"/,
    "fill boards keep min-h-0 flex-1",
  );
  assert.doesNotMatch(
    source,
    /"flex min-h-0 min-w-0 flex-1 flex-col gap-3"/,
    "report pages must not always be height-constrained",
  );
  assert.doesNotMatch(source, /fill && "h-full"/);
});

test("Branch operator pages do not stack a mobile back+title ControlBar under AppHeader", () => {
  const operatorRoot = join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)",
  );
  const forbidden = [
    /<BranchOperatorControlBar className="sm:hidden">/,
    /BranchSettingsBackControl/,
    /CatalogBackControl/,
    /OrdersMobileControlBar/,
    /PosSessionsMobileTitleBar/,
    /StockLandingMobileTitleBar/,
  ];

  for (const path of findTsxFiles(operatorRoot)) {
    const source = readFileSync(path, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, toRepoPath(path));
    }
  }

  const staffRuntime = [
    "lib/staff-runtime/count/page.tsx",
    "lib/staff-runtime/leave/page.tsx",
    "lib/staff-runtime/checkout-approvals/page.tsx",
    "lib/staff-runtime/payslip/page.tsx",
    "lib/staff-runtime/clock/page.tsx",
    "lib/staff-runtime/schedule/page.tsx",
    "lib/staff-runtime/page.tsx",
    "lib/staff-runtime/profile/page.tsx",
  ];
  for (const relative of staffRuntime) {
    const source = read(relative);
    assert.doesNotMatch(
      source,
      /<BranchOperatorControlBar className="sm:hidden">/,
      relative,
    );
  }
});

test("settings landing and children keep one page H1 without a duplicate mobile title bar", () => {
  const landing = read(
    "app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  assert.doesNotMatch(landing, /hideHeaderOnMobile/);
  assert.doesNotMatch(landing, /BranchOperatorControlBar|BranchSettingsBackControl/);

  for (const child of ["tables", "pos", "kds", "printers", "network"] as const) {
    const source = read(
      `app/(protected)/br/[branchId]/(operator)/settings/${child}/page.tsx`,
    );
    assert.match(source, /<BranchOperatorPage/, child);
    assert.doesNotMatch(source, /hideHeaderOnMobile/, child);
    assert.doesNotMatch(
      source,
      /BranchSettingsBackControl|BranchOperatorControlBar/,
      child,
    );
  }
});

test("menu-limits overlay does not add a ControlBar under the sheet", () => {
  const page = read(
    "app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
  );
  const host = read(
    "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-host.tsx",
  );
  assert.doesNotMatch(page, /BranchOperatorControlBar|BranchSettingsBackControl/);
  assert.doesNotMatch(host, /BranchOperatorControlBar/);
  assert.match(host, /BranchQuickMenuLimitSheet/);
});

test("Branch detail pages share one desktop two-pane recipe", () => {
  const adapter = read(
    "lib/branch-operator/components/branch-operator-page.tsx",
  );
  const detailClients = [
    "app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/branch-grn-receipt-client.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/grn/[id]/grn-review-operator-client.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/branch-stock-ingredient-detail.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/branch-stocktake-detail-client.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/branch-transfer-detail-client.tsx",
  ];

  assert.match(adapter, /export const BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME/);
  for (const path of detailClients) {
    const source = read(path);
    assert.match(source, /BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME/, path);
    assert.doesNotMatch(
      source,
      /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(17rem,0\.65fr\)\]/,
      path,
    );
  }
});
