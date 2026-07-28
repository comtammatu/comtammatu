import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * DETAIL history tab clone from GRN exemplar: document + Lịch sử via AppPageTabs,
 * not collapsible AuditHistoryList in the document body.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const DETAIL_CLIENTS = [
  "app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  "app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  "app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
] as const;

for (const path of DETAIL_CLIENTS) {
  test(`${path} uses AppPageTabs document/history (not collapsible audit)`, () => {
    const client = read(path);
    assert.match(client, /AppPageTabs/, `${path}: AppPageTabs`);
    assert.match(client, /value:\s*"document"/, `${path}: document tab`);
    assert.match(client, /value:\s*"history"/, `${path}: history tab`);
    assert.match(
      client,
      /TabsContent value="history"/,
      `${path}: history pane`,
    );
    assert.match(client, /AuditHistoryList/, `${path}: audit list`);
    assert.doesNotMatch(
      client,
      /collapsible=\{true\}[\s\S]{0,120}AuditHistoryList|AuditHistoryList[\s\S]{0,80}collapsible/,
      `${path}: history must not be collapsible in document body`,
    );
  });
}
