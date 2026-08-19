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

test("Branch operator headers hide visually only on mobile when a compact title replaces them", () => {
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

test("Branch stock pages with an inline mobile title opt into the responsive header contract", () => {
  const stockRoot = join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/stock",
  );
  const composedPages = findTsxFiles(stockRoot).filter((path) => {
    const source = readFileSync(path, "utf8");
    return (
      source.includes("<BranchOperatorPage") &&
      source.includes("<BranchOperatorControlBar")
    );
  });

  assert.ok(
    composedPages.length >= 14,
    "expected all direct stock compositions",
  );
  for (const path of composedPages) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /<BranchOperatorPage[\s\S]*?hideHeaderOnMobile/, path);
    assert.match(
      source,
      /<BranchOperatorControlBar className="sm:hidden">/,
      path,
    );
  }

  const transferPage = read(
    "app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/page.tsx",
  );
  const transferClient = read(
    "app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/branch-transfer-detail-client.tsx",
  );
  assert.match(transferPage, /<BranchOperatorPage[\s\S]*hideHeaderOnMobile/);
  assert.match(transferPage, /<BranchTransferDetailClient/);
  assert.match(
    transferClient,
    /<BranchOperatorControlBar className="sm:hidden">/,
  );
});

test("catalog subpages reuse the mobile control bar instead of a second H1", () => {
  const source = read(
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-back-header.tsx",
  );
  assert.match(source, /<BranchOperatorControlBar className="sm:hidden">/);
  assert.match(source, /ACTIONS_VI\.back/);
  assert.doesNotMatch(source, /<h1/);
});

const STAFF_RUNTIME_BY_EXPORT: Record<string, string> = {
  StaffCountPageContent: "lib/staff-runtime/count/page.tsx",
  EmployeeLeavePageContent: "lib/staff-runtime/leave/page.tsx",
  StaffCheckoutApprovalsPageContent:
    "lib/staff-runtime/checkout-approvals/page.tsx",
  StaffPayslipPageContent: "lib/staff-runtime/payslip/page.tsx",
  StaffClockPageContent: "lib/staff-runtime/clock/page.tsx",
  StaffSchedulePageContent: "lib/staff-runtime/schedule/page.tsx",
  StaffWorkdayPageContent: "lib/staff-runtime/page.tsx",
  StaffProfilePageContent: "lib/staff-runtime/profile/page.tsx",
};

const SETTINGS_BACK_CONTROL =
  "app/(protected)/br/[branchId]/(operator)/settings/_components/branch-settings-back-control.tsx";
const SETTINGS_CHILD_PAGES = [
  "tables",
  "pos",
  "kds",
  "printers",
  "network",
] as const;

const CONTROL_BAR_CLOSE = "</BranchOperatorControlBar>";

function extractControlBars(source: string): string[] {
  const bars: string[] = [];
  const open = "<BranchOperatorControlBar";
  let from = 0;
  while (true) {
    const start = source.indexOf(open, from);
    if (start < 0) break;
    const end = source.indexOf(CONTROL_BAR_CLOSE, start);
    if (end < 0) break;
    bars.push(source.slice(start, end + CONTROL_BAR_CLOSE.length));
    from = end + CONTROL_BAR_CLOSE.length;
  }
  return bars;
}

function toRepoPath(absPath: string): string {
  const index = absPath.lastIndexOf("apps/web/");
  if (index >= 0) return absPath.slice(index + "apps/web/".length);
  const winIndex = absPath.lastIndexOf("apps\\web\\");
  if (winIndex >= 0) return absPath.slice(winIndex + "apps\\web\\".length);
  return absPath;
}

function relatedSources(absPath: string, source: string): string[] {
  const sources = [source];
  const directory = absPath.slice(0, absPath.lastIndexOf("/"));
  for (const sibling of findTsxFiles(directory)) {
    if (sibling === absPath) continue;
    sources.push(readFileSync(sibling, "utf8"));
  }
  for (const [exported, relative] of Object.entries(STAFF_RUNTIME_BY_EXPORT)) {
    if (source.includes(exported)) sources.push(read(relative));
  }
  if (source.includes("BranchSettingsBackControl")) {
    sources.push(read(SETTINGS_BACK_CONTROL));
  }
  return sources;
}

test("remaining operator hideHeaderOnMobile pages keep a mobile ControlBar title", () => {
  const operatorRoot = join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)",
  );
  const homePage = join(operatorRoot, "page.tsx");
  const pages = findTsxFiles(operatorRoot).filter((path) => {
    if (path === homePage) return false;
    // Overlay host: drawer owns the title; page H1 is sr-only on mobile.
    if (path.endsWith("/menu-limits/page.tsx")) return false;
    return readFileSync(path, "utf8").includes("hideHeaderOnMobile");
  });

  assert.ok(pages.length >= 20, "expected remaining operator hideHeaderOnMobile pages");

  for (const path of pages) {
    const source = readFileSync(path, "utf8");
    const combined = relatedSources(path, source).join("\n");
    assert.match(
      combined,
      /<BranchOperatorControlBar className="sm:hidden">/,
      toRepoPath(path),
    );
  }

  for (const relative of Object.values(STAFF_RUNTIME_BY_EXPORT)) {
    const source = read(relative);
    if (!source.includes("hideHeaderOnMobile")) continue;
    assert.match(
      source,
      /<BranchOperatorControlBar className="sm:hidden">/,
      relative,
    );
  }
});

test("operator ControlBar chrome does not host primary size=touch CTAs", () => {
  const operatorRoot = join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)",
  );
  const files = [
    ...findTsxFiles(operatorRoot),
    ...Object.values(STAFF_RUNTIME_BY_EXPORT).map((relative) =>
      join(process.cwd(), relative),
    ),
  ];

  for (const path of files) {
    const source = readFileSync(path, "utf8");
    for (const bar of extractControlBars(source)) {
      assert.doesNotMatch(
        bar,
        /size="touch"/,
        `${toRepoPath(path)} ControlBar must not include size="touch"`,
      );
    }
  }
});

test("settings landing keeps a visible H1; settings children use mobile ControlBar", () => {
  const landing = read(
    "app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  assert.doesNotMatch(landing, /hideHeaderOnMobile/);
  assert.doesNotMatch(landing, /BranchOperatorControlBar|BranchSettingsBackControl/);

  const chrome = read(SETTINGS_BACK_CONTROL);
  assert.match(chrome, /<BranchOperatorControlBar className="sm:hidden">/);
  assert.match(chrome, /size="icon-touch"/);
  assert.match(chrome, /href=\{`\/br\/\$\{branchId\}\/settings`\}/);
  assert.doesNotMatch(chrome, /href="\/settings"|href=\{`\/settings/);
  assert.doesNotMatch(chrome, /size="touch"/);

  for (const child of SETTINGS_CHILD_PAGES) {
    const source = read(
      `app/(protected)/br/[branchId]/(operator)/settings/${child}/page.tsx`,
    );
    assert.match(
      source,
      /<BranchOperatorPage[\s\S]*?hideHeaderOnMobile/,
      child,
    );
    assert.match(source, /<BranchSettingsBackControl/, child);
  }
});

test("menu-limits overlay hides the page H1 on mobile without a ControlBar under the sheet", () => {
  const page = read(
    "app/(protected)/br/[branchId]/(operator)/menu-limits/page.tsx",
  );
  const host = read(
    "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-host.tsx",
  );
  assert.match(page, /<BranchOperatorPage[\s\S]*?hideHeaderOnMobile/);
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
