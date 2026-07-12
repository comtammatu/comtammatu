import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const existsWeb = (path: string): boolean =>
  existsSync(join(process.cwd(), path));

test("Branch stock does not duplicate tenant-wide catalog ownership", () => {
  for (const path of [
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/page.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-index-client.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-list.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/categories/page.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/ingredients/page.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/units/page.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/thresholds/page.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/suppliers/page.tsx",
  ]) {
    assert.equal(existsWeb(path), false, path);
  }
  assert.equal(existsWeb("lib/messages/catalog.ts"), false);
});

test("tenant-wide inventory catalog stays on canonical Office routes", () => {
  for (const path of [
    "app/(protected)/inventory/ingredients/page.tsx",
    "app/(protected)/inventory/settings/categories/page.tsx",
    "app/(protected)/inventory/settings/units/page.tsx",
    "app/(protected)/inventory/settings/thresholds/page.tsx",
    "app/(protected)/inventory/suppliers/page.tsx",
  ]) {
    assert.equal(existsWeb(path), true, path);
  }
});
