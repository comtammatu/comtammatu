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
const hubClient = readFileSync(
  resolve(
    repoRoot,
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/transfer/branch-stock-fulfillment-hub-client.tsx",
  ),
  "utf8",
);

test("Branch fulfillment hub deep-links to detail pages without Owner dialogs", () => {
  const stockPage = readFileSync(
    resolve(
      repoRoot,
      "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
    ),
    "utf8",
  );
  assert.match(stockPage, /BranchStockFulfillmentHubClient/);
  assert.match(stockPage, /loadStockFulfillmentRows/);
  assert.match(transferPage, /redirect\([\s\S]*\/stock/);
  assert.doesNotMatch(transferPage, /loadStockRequestFulfillmentDetail/);
  assert.doesNotMatch(transferPage, /loadTransferDetailPageData/);
  assert.doesNotMatch(transferPage, /selectedRequest|selectedTransfer/);

  assert.match(hubClient, /stockFulfillmentRowHref/);
  assert.match(hubClient, /preferWork:/);
  assert.match(hubClient, /receiveFocus[\s\S]*?"receive"/);
  assert.match(hubClient, /searchParams\.get\("work"\)/);
  assert.match(hubClient, /searchParams\.get\("q"\)/);
  assert.match(hubClient, /mode === "branch" \? "active" : "all"/);
  assert.match(hubClient, /copy\.receiveCta/);
  assert.doesNotMatch(hubClient, /DataTable|AppDialog|AppListFrame/);

  const hubModel = readFileSync(
    resolve(repoRoot, "apps/web/lib/inventory/stock-fulfillment-hub-model.ts"),
    "utf8",
  );
  assert.match(hubModel, /preferWork\?:/);
  assert.match(hubModel, /\/stock\/receive\/\$\{transferId\}/);
  assert.match(hubModel, /\/stock\/requests\/\$\{row\.requestId\}/);
  assert.match(hubModel, /\/stock\/transfer\/\$\{row\.transferId\}/);
  assert.match(hubModel, /summarizeBranchStockWork/);
  assert.match(hubModel, /stockFulfillmentReceiveTransferId/);
});
