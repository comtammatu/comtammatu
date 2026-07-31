import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readWebFile(path: string): string {
  return readFileSync(path, "utf8");
}

test("inventory stock stays a LIST after hub removal without alert strip", () => {
  const stockClient = readWebFile(
    "app/(protected)/inventory/stock/stock-client.tsx",
  );
  const page = readWebFile("app/(protected)/inventory/page.tsx");

  assert.doesNotMatch(stockClient, /NoteCallout/);
  assert.doesNotMatch(stockClient, /underThresholdItems/);
  assert.doesNotMatch(stockClient, /stockCopy\.attention/);
  assert.match(stockClient, /underThresholdButton/);
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
