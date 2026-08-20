import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const orderGridSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
  ),
  "utf8",
);

const batchActionsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/batch-actions.tsx",
  ),
  "utf8",
);

test("KDS service columns keep semantic labels without visible title bars", () => {
  assert.match(orderGridSource, /aria-label=\{column\.title\}/);
  assert.doesNotMatch(orderGridSource, /kds-column-title-/);
  assert.doesNotMatch(orderGridSource, /<h2[\s\S]*\{column\.title\}/);
  assert.match(
    orderGridSource,
    /className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1 pb-4 xl:gap-3\.5"/,
  );
  assert.doesNotMatch(orderGridSource, /space-y-/);
  assert.doesNotMatch(orderGridSource, /column\.orders\.length > 5/);
  assert.doesNotMatch(orderGridSource, /xl:grid-cols-2/);
  assert.match(
    orderGridSource,
    /className="flex min-h-0 min-w-0 flex-col xl:h-full"/,
  );
  assert.match(
    orderGridSource,
    /className="grid min-h-full grid-cols-1 gap-3 p-2\.5 md:grid-cols-3 md:gap-3\.5 md:p-3 xl:h-full xl:min-h-0 xl:grid-cols-3 xl:gap-4 xl:overflow-hidden xl:p-3\.5"/,
  );
  assert.doesNotMatch(orderGridSource, /xl:grid-cols-8/);
  assert.doesNotMatch(orderGridSource, /column\.widthClass/);
  assert.doesNotMatch(
    orderGridSource,
    /rounded-lg border border-border\/70 bg-card\/40/,
  );
  assert.match(orderGridSource, /<AppEmptyState[\s\S]*compact/);
  assert.match(
    orderGridSource,
    /data-testid=\{`kds-column-empty-\$\{column\.id\}`\}/,
  );
  assert.match(
    orderGridSource,
    /className="border-dashed bg-muted\/30 px-3 py-3"/,
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

test("KDS compact item rows use a bare quantity, stacked meta, and Xong label", () => {
  assert.doesNotMatch(orderGridSource, /quantitySuffix/);
  assert.match(orderGridSource, /completeVisible: "Xong"/);
  assert.doesNotMatch(orderGridSource, /transition-colors duration-150/);
  assert.match(orderGridSource, /elapsedMs=\{elapsedMs\}/);
  assert.match(orderGridSource, /canRecall=\{canRecall\}/);
  assert.match(orderGridSource, /onRecall=\{onRecall\}/);
  assert.match(orderGridSource, /data-testid=\{`kds-recall-/);
  assert.match(orderGridSource, /data-testid=\{`kds-heatmap-complete-ticket-/);
  assert.doesNotMatch(orderGridSource, /onOutOfStock/);
  assert.doesNotMatch(orderGridSource, /data-testid=\{`kds-out-of-stock-/);
});
