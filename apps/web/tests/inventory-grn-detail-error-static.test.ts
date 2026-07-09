import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionsSource = readFileSync("app/(protected)/inventory/grn-actions.ts", "utf8");
const pageSource = readFileSync(
  "app/(protected)/inventory/grn/[id]/page.tsx",
  "utf8",
);
const lineActionsSource = readFileSync(
  "app/(protected)/inventory/grn/[id]/_hooks/use-grn-line-actions.ts",
  "utf8",
);

test("GRN detail load failures render an error state instead of inventory not-found", () => {
  assert.match(actionsSource, /\.maybeSingle\(\)/);
  assert.match(actionsSource, /errorCode: "load_failed"/);
  assert.match(actionsSource, /errorCode: "not_found"/);

  assert.match(pageSource, /notFound: res\.errorCode === "not_found"/);
  assert.match(pageSource, /<GrnDetailLoadError error=\{result\.error\} \/>/);
  assert.match(pageSource, /result\.error && !result\.notFound/);
});

test("GRN detail route accepts numeric IDs and GRN document numbers", () => {
  assert.match(actionsSource, /fetchGrnDetail\(\s*grnKey: number \| string,/);
  assert.match(actionsSource, /\.eq\("id", lookup\.value\)/);
  assert.match(actionsSource, /\.eq\("grn_number", lookup\.value\)/);
  assert.match(
    pageSource,
    /fetchEntityAuditLogs\("goods_received_note", d\.grn\.id, 50\)/,
  );
  assert.match(pageSource, /function isGrnLookupParam\(value: string\)/);
  assert.match(actionsSource, /\^GRN-\[A-Za-z0-9_-\]\{1,60\}\$/);
  assert.match(pageSource, /\^GRN-\[A-Za-z0-9_-\]\{1,60\}\$/);
  assert.match(pageSource, /if \(!isGrnLookupParam\(id\)\) notFound\(\)/);
});

test("GRN partial line save keeps failed rows dirty", () => {
  assert.match(lineActionsSource, /const savedLineIds = new Set<number>\(\)/);
  assert.match(lineActionsSource, /savedLineIds\.add\(l\.lineId\)/);
  assert.match(lineActionsSource, /savedLineIds\.has\(l\.lineId\)/);
  assert.doesNotMatch(
    lineActionsSource,
    /setLines\(\(prev\) => prev\.map\(\(l\) => \(\{ \.\.\.l, dirty: false \}\)\)\)/,
  );
});
