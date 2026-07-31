import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/(protected)/inventory/page.tsx", "utf8");
const homeSource = readFileSync(
  "app/(protected)/inventory/_lib/inventory-home.ts",
  "utf8",
);
const pathsSource = readFileSync(
  "app/(protected)/inventory/_lib/paths.ts",
  "utf8",
);

test("inventory root is a fixed landing redirect (stock or accountant GRN)", () => {
  assert.match(pageSource, /resolveInventoryHomePath/);
  assert.match(pageSource, /redirect\(resolveInventoryHomePath/);
  assert.doesNotMatch(pageSource, /DashboardClient|loadInventoryDashboardData/);
  assert.match(homeSource, /role === "accountant"/);
  assert.match(homeSource, /\/inventory\/grn/);
  assert.match(homeSource, /\/inventory\/stock/);
});

test("inventory paths ban /operations?tab= entrypoints", () => {
  assert.doesNotMatch(pathsSource, /operations\?tab=/);
  assert.doesNotMatch(pageSource, /operations\?tab=/);
});
