import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAutomaticPurchaseDemandAllocations,
  buildPurchaseOrderDrafts,
  findUnassignedPurchaseRequestItemIds,
} from "../lib/inventory/purchase-order-drafts";

test("purchase demand auto-allocates when every remaining item has one supplier", () => {
  const allocations = buildAutomaticPurchaseDemandAllocations(
    [
      { id: 11, ingredientId: 101, remainingQuantity: 5 },
      { id: 12, ingredientId: 102, remainingQuantity: 3 },
      { id: 13, ingredientId: 103, remainingQuantity: 0 },
    ],
    [
      {
        id: 1,
        name: "NCC A",
        ingredientIds: [101],
        preferredIngredientIds: [101],
      },
      {
        id: 2,
        name: "NCC B",
        ingredientIds: [102],
        preferredIngredientIds: [102],
      },
    ],
  );

  assert.deepEqual(allocations, [
    { requestItemId: 11, supplierId: 1, quantity: 5 },
    { requestItemId: 12, supplierId: 2, quantity: 3 },
  ]);
});

test("purchase demand requires supplier allocation for zero or multiple matches", () => {
  const item = [{ id: 11, ingredientId: 101, remainingQuantity: 5 }];
  const supplier = {
    id: 1,
    name: "NCC A",
    ingredientIds: [101],
    preferredIngredientIds: [101],
  };

  assert.equal(buildAutomaticPurchaseDemandAllocations(item, []), null);
  assert.equal(
    buildAutomaticPurchaseDemandAllocations(
      [{ ...item[0]!, remainingQuantity: 0 }],
      [supplier],
    ),
    null,
  );
  assert.equal(
    buildAutomaticPurchaseDemandAllocations(item, [
      supplier,
      { ...supplier, id: 2, name: "NCC B" },
    ]),
    null,
  );
});

test("purchase demand shows every matching supplier without auto-allocating quantities", () => {
  const drafts = buildPurchaseOrderDrafts(
    [
      { id: 11, ingredientId: 101, remainingQuantity: 5 },
      { id: 12, ingredientId: 102, remainingQuantity: 3 },
    ],
    [
      {
        id: 1,
        name: "NCC A",
        ingredientIds: [101, 102],
        preferredIngredientIds: [101],
      },
      {
        id: 2,
        name: "NCC B",
        ingredientIds: [101],
        preferredIngredientIds: [],
      },
      {
        id: 3,
        name: "NCC C",
        ingredientIds: [102],
        preferredIngredientIds: [],
      },
    ],
  );

  assert.deepEqual(
    drafts.map((draft) => draft.supplierName),
    ["NCC A", "NCC B", "NCC C"],
  );
  assert.equal(drafts[0]?.lines[0]?.quantity, "");
  assert.equal(drafts[1]?.lines[0]?.quantity, "");
  assert.equal(drafts[0]?.lines[1]?.quantity, "");
  assert.equal(drafts[2]?.lines[0]?.quantity, "");
});

test("saved supplier allocations are restored by demand item and supplier", () => {
  const drafts = buildPurchaseOrderDrafts(
    [{ id: 11, ingredientId: 101, remainingQuantity: 5 }],
    [
      {
        id: 1,
        name: "NCC A",
        ingredientIds: [101],
        preferredIngredientIds: [101],
      },
      {
        id: 2,
        name: "NCC B",
        ingredientIds: [101],
        preferredIngredientIds: [],
      },
    ],
    [
      { requestItemId: 11, supplierId: 1, quantity: 2 },
      { requestItemId: 11, supplierId: 2, quantity: 3 },
    ],
  );

  assert.equal(drafts[0]?.lines[0]?.quantity, "2");
  assert.equal(drafts[1]?.lines[0]?.quantity, "3");
});

test("purchase request reports remaining ingredients without an active supplier mapping", () => {
  const unassigned = findUnassignedPurchaseRequestItemIds(
    [
      { id: 11, ingredientId: 101, remainingQuantity: 5 },
      { id: 12, ingredientId: 102, remainingQuantity: 0 },
      { id: 13, ingredientId: 103, remainingQuantity: 2 },
    ],
    [
      {
        id: 1,
        name: "NCC A",
        ingredientIds: [101, 102],
        preferredIngredientIds: [101],
      },
    ],
  );

  assert.deepEqual(unassigned, [13]);
});
