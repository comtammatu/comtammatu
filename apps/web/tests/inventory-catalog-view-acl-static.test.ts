import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(
  "app/(protected)/inventory/ingredients/page.tsx",
  "utf8",
);
const client = readFileSync(
  "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  "utf8",
);
const protectedLayout = readFileSync("app/(protected)/layout.tsx", "utf8");
const nav = readFileSync(
  "app/(protected)/inventory/_lib/inventory-nav.ts",
  "utf8",
);
const stockData = readFileSync("lib/inventory/stock-on-hand-data.ts", "utf8");

test("ingredients page allows catalog view roles and gates CRUD to owner manage", () => {
  assert.match(page, /INVENTORY_CATALOG_VIEW_ROLES/);
  assert.match(page, /CATALOG_READ_PERMISSIONS/);
  assert.match(page, /INVENTORY_CATALOG_ROLES/);
  assert.match(page, /CATALOG_MANAGE_PERMISSIONS/);
  assert.match(page, /canManage=\{canManageCatalog\}/);
});

test("ingredients client hides create/edit when canManage is false", () => {
  assert.match(client, /canManage\?: boolean/);
  assert.match(client, /if \(!canManage\) return \[\]/);
  assert.match(client, /canManage \? \([\s\S]*openCreate/);
  assert.match(client, /onRowClick=\{canManage \? openEdit : undefined\}/);
});

test("persistent shell exposes catalog read nav for central ops without manage", () => {
  assert.match(protectedLayout, /showCatalogRead/);
  assert.match(protectedLayout, /isCentralCatalogViewer/);
  assert.match(nav, /showCatalogManagement \|\| showCatalogRead/);
});

test("stock on hand fails closed when ingredient catalog load fails", () => {
  assert.match(stockData, /inventory\.stock\.ingredients_load_failed/);
  assert.doesNotMatch(
    stockData,
    /ingredientsResult\.success\s*\?\s*\([\s\S]*\)\s*:\s*\[\]/,
  );
});
