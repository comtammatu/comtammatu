import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readActiveMigrationSql, extractSqlFunction, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = join(import.meta.dirname, "../../..");

const actionSource = readFileSync(
  join(root, "apps/web/app/(protected)/inventory/actions.ts"),
  "utf8",
);
const detailSource = readFileSync(
  join(
    root,
    "apps/web/app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  ),
  "utf8",
);
const messageSource = readFileSync(
  join(root, "apps/web/lib/messages/inventory.ts"),
  "utf8",
);
const stocktakeActionSource = readFileSync(
  join(root, "apps/web/app/(protected)/inventory/stocktake-actions.ts"),
  "utf8",
);
const ownerCountPageSource = readFileSync(
  join(
    root,
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/page.tsx",
  ),
  "utf8",
);
const branchCountDataSource = readFileSync(
  join(root, "apps/web/lib/inventory/branch-stocktake-data.ts"),
  "utf8",
);
const ownerCountClientSource = readFileSync(
  join(
    root,
    "apps/web/app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
  ),
  "utf8",
);
const branchCountClientSource = readFileSync(
  join(
    root,
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/[id]/count/branch-stocktake-count-client.tsx",
  ),
  "utf8",
);

function latestCompleteStocktakeDefinition(): string {
  return extractSqlFunction(readActiveMigrationSql(root), "complete_stocktake");
}

test("counted stocktake variances can be completed without reason metadata", () => {
  const sql = latestCompleteStocktakeDefinition();

  assert.notEqual(sql, "");
  assertSqlNotMatch(sql, /stocktake_reason_code_required/);
  assert.doesNotMatch(actionSource, /stocktake_reason_code_required/);
  assert.doesNotMatch(detailSource, /reasonCodeRequired|missingReason/);
});

test("active stocktake review does not ask for a variance reason", () => {
  assert.doesNotMatch(detailSource, /WasteReasonDropdown/);
  assert.doesNotMatch(detailSource, /onReasonCodeChange|onReasonBlur/);
  assert.doesNotMatch(messageSource, /reasonCodeRequired/);
});

test("stocktake drafts are round-scoped and restored on both count surfaces", () => {
  assert.match(stocktakeActionSource, /roundNo:/);
  assert.match(
    stocktakeActionSource,
    /draft_counts:[\s\S]*roundNo[\s\S]*counts/,
  );
  assert.match(ownerCountPageSource, /\.from\("stocktake_drafts"\)/);
  assert.match(branchCountDataSource, /\.from\("stocktake_drafts"\)/);
  assert.match(ownerCountClientSource, /initialDraftCounts/);
  assert.match(branchCountClientSource, /data\.initialDraftCounts/);
});
