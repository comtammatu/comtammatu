import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const BATCH_A = [
  {
    name: "grn",
    path: "app/(protected)/inventory/grn/grn-list-client.tsx",
    getActions: "rowActions",
  },
  {
    name: "issues",
    path: "app/(protected)/inventory/issues/issues-client.tsx",
    getActions: "getIssueRowActions",
  },
  {
    name: "stocktake",
    path: "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
    getActions: "getStocktakeRowActions",
  },
] as const;

test("Wave 1 batch A inventory LIST surfaces wire three doors from one RowActionItem[]", () => {
  for (const surface of BATCH_A) {
    const source =
      surface.name === "issues"
        ? read(surface.path) +
          read("app/(protected)/inventory/issues/issue-list-chrome.tsx")
        : read(surface.path);

    assert.match(
      source,
      new RegExp(`(?:const|function) ${surface.getActions}(?:\\s*=|\\s*\\()`),
      `${surface.name}: get*RowActions`,
    );
    assert.match(source, /<RowActionsMenu/, `${surface.name}: RowActionsMenu`);
    assert.match(
      source,
      /renderRowContextMenu=\{/,
      `${surface.name}: renderRowContextMenu`,
    );
    assert.match(
      source,
      /RowActionsContextMenuItems\s+items=\{/,
      `${surface.name}: RowActionsContextMenuItems`,
    );
    assert.match(source, /onRowClick=\{/, `${surface.name}: onRowClick`);

    assert.doesNotMatch(
      source,
      /IconDotsVertical/,
      `${surface.name}: no IconDotsVertical`,
    );
    assert.doesNotMatch(
      source,
      /render=\{<Link[^>]*>[\s\S]*IconDots/,
      `${surface.name}: no fake overflow Link`,
    );
    assert.doesNotMatch(
      source,
      /<Button[\s\S]{0,200}render=\{<Link[\s\S]{0,120}IconDotsVertical/,
      `${surface.name}: no IconDotsVertical inside Link Button`,
    );
  }
});

test("Wave 1 batch A stocktake removes Drawer dual-path and keeps cancel in RowActionItem[]", () => {
  const stocktake = read(
    "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  );

  assert.doesNotMatch(stocktake, /from "@comtammatu\/ui\/components\/drawer"/);
  assert.doesNotMatch(stocktake, /<Drawer/);
  assert.doesNotMatch(stocktake, /useLongPress/);
  assert.doesNotMatch(stocktake, /onOpenDrawer/);
  assert.doesNotMatch(stocktake, /setDrawerRow/);

  assert.match(stocktake, /getStocktakeRowActions/);
  assert.match(stocktake, /key:\s*"cancel"/);
  assert.match(stocktake, /destructive:\s*true/);
  assert.match(stocktake, /handleCancelSession/);
  assert.match(stocktake, /onRowClick=\{openStocktakeDetail\}/);
  assert.match(
    stocktake,
    /href:\s*stocktakeDetailHref\(routeBase,\s*row\)/,
  );
});
