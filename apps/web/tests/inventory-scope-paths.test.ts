import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inventoryPathRequiresSiteScope,
  inventoryPathSupportsAggregateScope,
} from "../app/(protected)/inventory/_lib/inventory-scope-paths";

test("inventory stock routes require a concrete site scope", () => {
  assert.equal(inventoryPathRequiresSiteScope("/inventory/stock"), true);
  assert.equal(inventoryPathRequiresSiteScope("/inventory/stock/42"), true);
});

test("inventory list routes that aggregate across sites keep all scope", () => {
  assert.equal(inventoryPathSupportsAggregateScope("/inventory/grn"), true);
  assert.equal(
    inventoryPathSupportsAggregateScope("/inventory/purchase-orders"),
    true,
  );
  assert.equal(inventoryPathSupportsAggregateScope("/inventory/transfers"), true);
  assert.equal(
    inventoryPathSupportsAggregateScope("/inventory/stocktake"),
    true,
  );
});

test("inventory count and menu recipe routes require site scope", () => {
  assert.equal(
    inventoryPathRequiresSiteScope("/inventory/count-assignments"),
    true,
  );
  assert.equal(inventoryPathRequiresSiteScope("/inventory/menu-recipes"), true);
});
