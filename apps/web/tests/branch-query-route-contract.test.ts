import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const transferPage = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/page.tsx",
  ),
  "utf8",
);

test("Branch fulfillment query links hydrate their requested detail", () => {
  assert.match(transferPage, /requestId\?: string \| string\[\]/);
  assert.match(transferPage, /transferId\?: string \| string\[\]/);
  assert.match(transferPage, /loadStockRequestFulfillmentDetail/);
  assert.match(transferPage, /loadTransferDetailPageData/);
  assert.match(
    transferPage,
    /mode === "central" && Number\.isInteger\(requestId\)/,
  );
  assert.match(transferPage, /\{ transferId, routeBranchId: branchId \}/);
  assert.match(transferPage, /selectedRequest=\{selectedRequest\}/);
  assert.match(transferPage, /selectedTransfer=\{selectedTransfer\}/);
});
