import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const boardHeaderSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/board-header.tsx",
  ),
  "utf8",
);

const filterBarSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/filter-bar.tsx",
  ),
  "utf8",
);

const viewModeToggleSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/view-mode-toggle.tsx",
  ),
  "utf8",
);

const completionHistorySource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/completion-history-sheet.tsx",
  ),
  "utf8",
);

const batchSummarySource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/batch-summary-bar.tsx",
  ),
  "utf8",
);

test("KDS header keeps tablet widths in the touch layout instead of md desktop toolbar", () => {
  assert.match(boardHeaderSource, /xl:flex-nowrap/);
  assert.match(boardHeaderSource, /xl:order-none/);
  assert.match(boardHeaderSource, /xl:basis-auto/);
  assert.match(boardHeaderSource, /xl:min-w-max/);
  assert.match(boardHeaderSource, /<BranchRuntimeBackControl branchId=\{branchId\} \/>/);

  assert.doesNotMatch(boardHeaderSource, /md:flex-nowrap/);
  assert.doesNotMatch(boardHeaderSource, /md:order-none/);
  assert.doesNotMatch(boardHeaderSource, /className="h-8 px-2 text-sm"/);
});

test("KDS filter and mode controls use touch-sized targets", () => {
  assert.equal(boardHeaderSource.match(/size="icon-touch"/g)?.length, 3);
  assert.doesNotMatch(boardHeaderSource, /size="icon-lg"/);
  assert.match(filterBarSource, /size="touch"/);
  assert.match(filterBarSource, /min-w-28/);
  assert.match(filterBarSource, /size="icon-touch"/);
  assert.match(filterBarSource, /inline-flex min-h-11/);
  assert.doesNotMatch(filterBarSource, /size="icon-sm"/);

  assert.match(viewModeToggleSource, /size="touch"/);
  assert.doesNotMatch(viewModeToggleSource, /(?:min-)?h-11/);
  assert.doesNotMatch(viewModeToggleSource, /className="h-8"/);
  assert.match(completionHistorySource, /size="touch"/);
  assert.doesNotMatch(completionHistorySource, /size="sm"/);
});

test("KDS batch summary is title-free, quantity-first, and single-line chips", () => {
  assert.doesNotMatch(batchSummarySource, /batchSummaryCollapse/);
  assert.doesNotMatch(batchSummarySource, /batchSummaryExpand/);
  assert.doesNotMatch(batchSummarySource, /KDS_VI\.batchSummary[^A]/);
  assert.doesNotMatch(batchSummarySource, /useState/);
  assert.doesNotMatch(batchSummarySource, /size="sm"/);
  assert.doesNotMatch(batchSummarySource, /\bh-9\b/);
  assert.doesNotMatch(batchSummarySource, /text-xs/);
  assert.doesNotMatch(batchSummarySource, /overflow-x-auto/);
  assert.doesNotMatch(batchSummarySource, /<Badge/);
  assert.doesNotMatch(batchSummarySource, /flex-col/);
  assert.match(batchSummarySource, /flex-wrap/);
  assert.match(batchSummarySource, /whitespace-nowrap/);
  assert.match(batchSummarySource, /inline-flex items-center gap-1\.5/);
  assert.match(
    batchSummarySource,
    /font-mono text-xl font-semibold leading-none tabular-nums/,
  );
  assert.match(
    batchSummarySource,
    /\{formatCount\(item\.totalQuantity\)\}[\s\S]*\{item\.itemName\}/,
  );
  assert.match(batchSummarySource, /KDS_ITEM_NAME_CLASS/);
  assert.match(batchSummarySource, /aggregateKdsBatchSummary/);
});
