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
    /"min-h-0 flex-1 space-y-1\.5 overflow-y-auto xl:space-y-2",\s*dense &&\s*"xl:grid xl:grid-cols-2 xl:content-start xl:gap-2 xl:space-y-0"/,
  );
  assert.match(
    orderGridSource,
    /const dense = column\.orders\.length > 5 && column\.id !== "add_on";/,
  );
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
  assert.match(
    orderGridSource,
    /className="flex items-center justify-center rounded-md border border-dashed border-border\/60 bg-muted\/20 px-3 py-3/,
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
  assert.match(batchActionsSource, /"Sẵn sàng"/);
});

test("KDS compact cards preserve item recall and out-of-stock actions", () => {
  assert.match(orderGridSource, /canRecall=\{canRecall\}/);
  assert.match(orderGridSource, /onRecall=\{onRecall\}/);
  assert.match(orderGridSource, /onOutOfStock=\{onOutOfStock\}/);
  assert.match(orderGridSource, /data-testid=\{`kds-recall-/);
  assert.match(orderGridSource, /data-testid=\{`kds-out-of-stock-/);
});
