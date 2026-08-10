import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Phase C — Inventory LIST megaclient split + GRN-gold URL filter ratchet.
 * Shell clients stay lean; overlays/helpers live beside them.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function lineCount(path: string): number {
  return read(path).split(/\r?\n/).length;
}

test("Issues LIST shell stays under megaclient budget and imports overlays", () => {
  const shell = "app/(protected)/inventory/issues/issues-client.tsx";
  const source = read(shell);
  assert.ok(
    lineCount(shell) <= 750,
    `issues-client.tsx is ${lineCount(shell)} LOC (budget 750)`,
  );
  assert.match(source, /from "\.\/issue-create-dialog"/);
  assert.match(source, /from "\.\/recorded-consumption-sheet"/);
  assert.match(source, /from "\.\/issue-list-helpers"/);
  assert.match(source, /export function IssuesClient/);
  assert.match(source, /getIssueRowActions/);
  assert.match(source, /recordedOrderId|status|type|\bq\b/);
});

test("Purchase-requests LIST shell stays under megaclient budget and imports overlays", () => {
  const shell =
    "app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx";
  const source = read(shell);
  assert.ok(
    lineCount(shell) <= 800,
    `purchase-requests-client.tsx is ${lineCount(shell)} LOC (budget 800)`,
  );
  assert.match(source, /from "\.\/purchase-request-form-dialog"/);
  assert.match(source, /from "\.\/purchase-request-view-dialog"/);
  assert.match(source, /from "\.\/purchase-request-allocate-dialog"/);
  assert.match(source, /export function PurchaseRequestsClient/);
  assert.match(source, /useDocumentOverlayUrl/);
});

test("Stocktake LIST binds status/q filters to URL searchParams", () => {
  const source = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );
  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("status"\)/);
  assert.match(source, /searchParams\.get\("q"\)/);
  assert.match(source, /replaceListFilters/);
});

test("Count slips queue view binds to URL queue param", () => {
  const source = read(
    "app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );
  assert.match(source, /searchParams\.get\("queue"\)/);
  assert.match(source, /replaceListParams/);
});

test("DOC authoring keeps DocumentFormFrame on transfers/new + stock-requests/new", () => {
  for (const path of [
    "app/(protected)/inventory/transfers/new/page.tsx",
    "app/(protected)/inventory/stock-requests/new/page.tsx",
  ] as const) {
    assert.ok(statSync(join(process.cwd(), path)).isFile());
    assert.match(read(path), /DocumentFormFrame/);
  }
});
