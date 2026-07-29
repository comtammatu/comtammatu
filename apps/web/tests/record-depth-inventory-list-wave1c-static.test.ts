import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Wave 1 batch C suppliers wires three doors from getSupplierRowActions", () => {
  const source = read(
    "app/(protected)/inventory/suppliers/suppliers-client.tsx",
  );

  assert.match(source, /const getSupplierRowActions\s*=/);
  assert.match(source, /<RowActionsMenu/);
  assert.match(source, /renderRowContextMenu=\{/);
  assert.match(source, /RowActionsContextMenuItems\s+items=\{/);
  assert.match(source, /onRowClick=\{openEdit\}/);
  assert.match(source, /key:\s*"edit"/);
  assert.match(source, /key:\s*"delete"/);
  assert.doesNotMatch(
    source,
    /size="icon"[\s\S]{0,120}onClick=\{\(\) => openEdit/,
  );
});

test("Wave 1 batch C supplier items wires menu + context when canManage", () => {
  const source = read(
    "app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  );

  assert.match(source, /const getSupplierItemRowActions\s*=/);
  assert.match(source, /<RowActionsMenu/);
  assert.match(source, /renderRowContextMenu=\{/);
  assert.match(source, /key:\s*"remove"/);
  assert.doesNotMatch(
    source,
    /aria-label=\{copy\.removeAria[\s\S]{0,80}<IconTrash/,
  );
});

test("Wave 1 batch C menu recipes wires three doors from getMenuRecipeRowActions", () => {
  const source = read(
    "app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
  );

  assert.match(source, /const getMenuRecipeRowActions\s*=/);
  assert.match(source, /<RowActionsMenu/);
  assert.match(source, /renderRowContextMenu=\{/);
  assert.match(source, /onRowClick=\{openEdit\}/);
  assert.match(source, /key:\s*"edit"/);
  assert.doesNotMatch(
    source,
    /variant="outline"[\s\S]{0,80}onClick=\{\(\) => openEdit\(recipe\)\}/,
  );
});

test("Wave 1 batch C categories wires three doors from getCategoryRowActions", () => {
  const source = read(
    "app/(protected)/inventory/settings/categories/categories-client.tsx",
  );

  assert.match(source, /function getCategoryRowActions/);
  assert.match(source, /<RowActionsMenu/);
  assert.match(source, /renderRowContextMenu=\{/);
  assert.match(source, /onRowClick=\{openEdit\}/);
  assert.match(source, /key:\s*"edit"/);
  assert.match(source, /key:\s*"delete"/);
});

test("Wave 1 batch C units packaging list wires menu + context from getUnitRowActions", () => {
  const source = read(
    "app/(protected)/inventory/settings/units/units-client.tsx",
  );

  assert.match(source, /function getUnitRowActions/);
  assert.match(source, /<RowActionsMenu/);
  assert.match(source, /renderRowContextMenu=\{/);
  assert.match(source, /key:\s*"edit"/);
  assert.match(source, /key:\s*"delete"/);
  assert.match(source, /key:\s*"deactivate"/);
  assert.doesNotMatch(source, /function RowActions\(/);
});

test("Wave 1 batch C thresholds stays C4 without row action cell", () => {
  const source = read(
    "app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
  );

  assert.doesNotMatch(source, /key:\s*"actions"/);
  assert.doesNotMatch(source, /<RowActionsMenu/);
  assert.doesNotMatch(source, /renderRowContextMenu/);
});
