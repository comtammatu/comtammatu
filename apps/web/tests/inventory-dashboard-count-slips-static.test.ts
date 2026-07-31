import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readWebFile(path: string): string {
  return readFileSync(path, "utf8");
}

test("inventory stock hosts Min-threshold alerts after hub removal", () => {
  const stockClient = readWebFile(
    "app/(protected)/inventory/stock/stock-client.tsx",
  );
  const page = readWebFile("app/(protected)/inventory/page.tsx");

  assert.match(stockClient, /stockCopy\.attention\.title/);
  assert.match(stockClient, /isStockReorderRisk/);
  assert.match(stockClient, /underThresholdItems/);
  assert.match(stockClient, /NoteCallout/);
  assert.doesNotMatch(page, /DashboardClient|dashboard-client/);
});

test("count-slip review routes stay addressable without dashboard hub", () => {
  const countSlips = readWebFile(
    "app/(protected)/inventory/count-slips/page.tsx",
  );
  const countAssignments = readWebFile(
    "app/(protected)/inventory/count-assignments/page.tsx",
  );

  assert.match(countSlips, /export default/);
  assert.match(countAssignments, /export default/);
});
