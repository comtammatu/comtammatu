import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPurchaseOrderDrafts,
  findUnassignedPurchaseRequestItemIds,
} from "../app/(protected)/inventory/purchase-requests/purchase-order-drafts";

test("purchase request shows every matching supplier without duplicating ambiguous quantities", () => {
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
  assert.equal(drafts[0]?.lines[0]?.quantity, "5");
  assert.equal(drafts[1]?.lines[0]?.quantity, "");
  assert.equal(drafts[0]?.lines[1]?.quantity, "");
  assert.equal(drafts[2]?.lines[0]?.quantity, "");
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
