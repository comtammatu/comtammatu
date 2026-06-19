import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const orderGridSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/components/order-grid.tsx",
  ),
  "utf8",
);

const batchActionsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/components/batch-actions.tsx",
  ),
  "utf8",
);

test("KDS service columns keep semantic labels without visible title bars", () => {
  assert.match(orderGridSource, /aria-label=\{column\.title\}/);
  assert.doesNotMatch(orderGridSource, /kds-column-title-/);
  assert.doesNotMatch(orderGridSource, /<h2[\s\S]*\{column\.title\}/);
  assert.match(
    orderGridSource,
    /className="flex min-h-0 flex-1 flex-col gap-1\.5 overflow-y-auto xl:gap-2"/,
  );
  assert.doesNotMatch(orderGridSource, /space-y-/);
  assert.doesNotMatch(orderGridSource, /column\.orders\.length > 5/);
  assert.doesNotMatch(orderGridSource, /xl:grid-cols-2/);
  assert.match(
    orderGridSource,
    /className=\{cn\(\s*"flex min-h-0 min-w-0 flex-col xl:h-full"/,
  );
  assert.match(
    orderGridSource,
    /className="grid min-h-full gap-1\.5 p-1\.5 md:grid-cols-3/,
  );
  assert.doesNotMatch(
    orderGridSource,
    /rounded-lg border border-border\/70 bg-card\/40/,
  );
  assert.match(orderGridSource, /<AppEmptyState[\s\S]*compact/);
  assert.match(orderGridSource, /data-testid=\{`kds-column-empty-\$\{column\.id\}`\}/);
  assert.match(
    orderGridSource,
    /className="border-dashed bg-muted\/20 px-3 py-3"/,
  );
  assert.doesNotMatch(orderGridSource, /md:grid-cols-2/);
  assert.doesNotMatch(orderGridSource, /lg:overflow-hidden/);
});

test("KDS batch completion action moves into the compact card title area", () => {
  assert.match(orderGridSource, /<BatchActions[\s\S]*layout="title"/);
  assert.doesNotMatch(orderGridSource, /layout="footer"/);

  assert.match(batchActionsSource, /layout\?: "footer" \| "title"/);
  assert.match(
    batchActionsSource,
    /size=\{layout === "title" \? "touch" : "touch-lg"\}/,
  );
  assert.match(batchActionsSource, /aria-label=\{fullLabel\}/);
  assert.match(batchActionsSource, /"Hoàn tất"/);
  assert.doesNotMatch(batchActionsSource, /confirm-dialog/);
  assert.doesNotMatch(batchActionsSource, /confirm\(/);
});

test("KDS compact cards preserve item recall and out-of-stock actions", () => {
  assert.match(orderGridSource, /canRecall=\{canRecall\}/);
  assert.match(orderGridSource, /onRecall=\{onRecall\}/);
  assert.match(orderGridSource, /onOutOfStock=\{onOutOfStock\}/);
  assert.match(orderGridSource, /data-testid=\{`kds-recall-/);
  assert.match(orderGridSource, /data-testid=\{`kds-out-of-stock-/);
});
