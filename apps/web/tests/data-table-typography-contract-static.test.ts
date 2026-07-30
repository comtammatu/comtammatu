import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dataTableSource = readFileSync(
  join(import.meta.dirname, "../app/components/data-table/data-table.tsx"),
  "utf8",
);
const orderSummarySource = readFileSync(
  join(import.meta.dirname, "../app/q/[token]/self-order/order-summary.tsx"),
  "utf8",
);

test("DataTable owns header and body typography after column layout classes", () => {
  assert.match(dataTableSource, /const DATA_TABLE_HEADER_TYPOGRAPHY =/);
  assert.match(dataTableSource, /font-sans text-xs font-medium uppercase/);
  assert.match(dataTableSource, /const DATA_TABLE_CELL_TYPOGRAPHY = "text-xs font-normal"/);
  assert.match(
    dataTableSource,
    /className=\{cn\(\s*col\.className,\s*DATA_TABLE_HEADER_TYPOGRAPHY,\s*"align-middle",\s*\)\}/,
  );
  assert.match(
    dataTableSource,
    /className=\{cn\(col\.className, DATA_TABLE_CELL_TYPOGRAPHY\)\}/,
  );
});

test("self-order bill has a matching mobile card presentation", () => {
  assert.match(
    orderSummarySource,
    /<DataTable[\s\S]*mobileCardRender=\{\(row\) => \(/,
  );
});
