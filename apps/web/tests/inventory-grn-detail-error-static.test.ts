import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionsSource = readFileSync(
  "app/(protected)/inventory/grn-actions.ts",
  "utf8",
);
const pageSource = readFileSync(
  "app/(protected)/inventory/grn/[id]/page.tsx",
  "utf8",
);
const listPageSource = readFileSync(
  "app/(protected)/inventory/grn/page.tsx",
  "utf8",
);
const listClientSource = readFileSync(
  "app/(protected)/inventory/grn/grn-list-client.tsx",
  "utf8",
);
const dataSource = readFileSync("lib/inventory/grn-detail-data.ts", "utf8");
const modelSource = readFileSync("lib/inventory/grn-detail-model.ts", "utf8");
const lineActionsSource = readFileSync(
  "lib/inventory/use-grn-detail-actions.ts",
  "utf8",
);

test("GRN detail load failures render an error state instead of inventory not-found", () => {
  assert.match(actionsSource, /\.maybeSingle\(\)/);
  assert.match(actionsSource, /errorCode: "load_failed"/);
  assert.match(actionsSource, /errorCode: "not_found"/);

  assert.match(dataSource, /notFound: result\.errorCode === "not_found"/);
  assert.match(listPageSource, /detailError=\{detailError\}/);
  assert.match(listClientSource, /open=\{detailError != null\}/);
  assert.match(listClientSource, /<AppEmptyState[\s\S]*mode="error"/);
});

test("GRN detail route accepts numeric IDs and GRN document numbers", () => {
  assert.match(actionsSource, /fetchGrnDetail\(\s*grnKey: number \| string,/);
  assert.match(actionsSource, /\.eq\("id", lookup\.value\)/);
  assert.match(actionsSource, /\.eq\("grn_number", lookup\.value\)/);
  assert.match(
    dataSource,
    /fetchEntityAuditLogs\(\s*"goods_received_note",\s*data\.grn\.id,\s*50,?\s*\)/,
  );
  assert.match(modelSource, /function isGrnLookupParam\(value: string\)/);
  assert.match(actionsSource, /\^GRN-\[A-Za-z0-9_-\]\{1,60\}\$/);
  assert.match(modelSource, /\^GRN-\[A-Za-z0-9_-\]\{1,60\}\$/);
  assert.match(pageSource, /if \(!isGrnLookupParam\(id\)\) notFound\(\)/);
});

test("GRN atomic save keeps all rows dirty when the RPC fails", () => {
  assert.match(lineActionsSource, /await saveGoodsReceiptNote\(/);
  assert.match(
    lineActionsSource,
    /if \(!result\.success\) \{[\s\S]*?return;[\s\S]*?setLines\(/,
  );
  assert.match(
    lineActionsSource,
    /previous\.map\(\(line\) => \(\{ \.\.\.line, dirty: false \}\)\)/,
  );
});
