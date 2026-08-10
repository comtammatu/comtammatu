import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/(protected)/inventory/page.tsx", "utf8");
const pathsSource = readFileSync(
  "app/(protected)/inventory/_lib/paths.ts",
  "utf8",
);

test("inventory root is a workflow LANDING (lanes), not a redirect hub", () => {
  assert.match(pageSource, /resolveInventoryNav/);
  assert.match(pageSource, /AppPage/);
  assert.doesNotMatch(pageSource, /resolveInventoryHomePath|redirect\(/);
  assert.doesNotMatch(pageSource, /DashboardClient|loadInventoryDashboardData/);
});

test("inventory paths ban /operations?tab= entrypoints", () => {
  assert.doesNotMatch(pathsSource, /operations\?tab=/);
  assert.doesNotMatch(pageSource, /operations\?tab=/);
});
