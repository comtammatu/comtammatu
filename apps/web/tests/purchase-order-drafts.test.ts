import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addPurchaseDemandAllocationRow,
  buildAutomaticPurchaseDemandAllocations,
  buildPurchaseOrderDrafts,
  canAddPurchaseDemandAllocationRow,
  findUnassignedPurchaseRequestItemIds,
  pickDefaultPurchaseDemandSupplier,
  reassignPurchaseDemandAllocationSupplier,
  removePurchaseDemandAllocationRow,
} from "../lib/inventory/purchase-order-drafts";

const supplierA = {
  id: 1,
  name: "NCC A",
  ingredientIds: [101, 102],
  preferredIngredientIds: [101],
};
const supplierB = {
  id: 2,
  name: "NCC B",
  ingredientIds: [101],
  preferredIngredientIds: [],
};
const supplierC = {
  id: 3,
  name: "NCC C",
  ingredientIds: [102],
  preferredIngredientIds: [],
};

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

test("purchase demand defaults one preferred supplier at full remaining qty", () => {
  const drafts = buildPurchaseOrderDrafts(
    [
      { id: 11, ingredientId: 101, remainingQuantity: 5 },
      { id: 12, ingredientId: 102, remainingQuantity: 3 },
    ],
    [supplierA, supplierB, supplierC],
  );

  const linesFor = (requestItemId: number) =>
    drafts.flatMap((draft) =>
      draft.lines
        .filter((line) => line.requestItemId === requestItemId)
        .map((line) => ({
          supplierId: draft.supplierId,
          quantity: line.quantity,
        })),
    );

  assert.deepEqual(linesFor(11), [{ supplierId: 1, quantity: "5" }]);
  assert.deepEqual(linesFor(12), [{ supplierId: null, quantity: "3" }]);
  assert.equal(
    pickDefaultPurchaseDemandSupplier(101, [supplierA, supplierB]),
    supplierA,
  );
  assert.equal(
    pickDefaultPurchaseDemandSupplier(102, [supplierA, supplierC]),
    null,
  );
});

test("purchase demand leaves an empty picker when several suppliers share an ingredient", () => {
  const drafts = buildPurchaseOrderDrafts(
    [{ id: 11, ingredientId: 101, remainingQuantity: 5 }],
    [
      { ...supplierA, preferredIngredientIds: [] },
      supplierB,
    ],
  );

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.supplierId, null);
  assert.equal(drafts[0]?.lines[0]?.quantity, "5");
  assert.equal(
    pickDefaultPurchaseDemandSupplier(101, [
      { ...supplierA, preferredIngredientIds: [] },
      supplierB,
    ]),
    null,
  );
});

test("saved supplier allocations are restored by demand item and supplier", () => {
  const drafts = buildPurchaseOrderDrafts(
    [{ id: 11, ingredientId: 101, remainingQuantity: 5 }],
    [supplierA, supplierB],
    [
      { requestItemId: 11, supplierId: 1, quantity: 2 },
      { requestItemId: 11, supplierId: 2, quantity: 3 },
    ],
  );

  const rows = drafts.flatMap((draft) =>
    draft.lines.map((line) => ({
      supplierId: draft.supplierId,
      quantity: line.quantity,
    })),
  );
  assert.deepEqual(rows, [
    { supplierId: 1, quantity: "2" },
    { supplierId: 2, quantity: "3" },
  ]);
});

test("adding an allocation row starts empty so the operator must split qty", () => {
  const initial = buildPurchaseOrderDrafts(
    [{ id: 11, ingredientId: 101, remainingQuantity: 5 }],
    [supplierA, supplierB],
  );
  assert.equal(
    canAddPurchaseDemandAllocationRow(initial, 11, 101, [supplierA, supplierB]),
    true,
  );

  const withSplit = addPurchaseDemandAllocationRow(
    initial,
    11,
    101,
    [supplierA, supplierB],
  );
  const rows = withSplit.flatMap((draft) =>
    draft.lines
      .filter((line) => line.requestItemId === 11)
      .map((line) => ({
        supplierId: draft.supplierId,
        quantity: line.quantity,
      })),
  );
  assert.deepEqual(rows, [
    { supplierId: 1, quantity: "5" },
    { supplierId: null, quantity: "" },
  ]);

  const reassigned = reassignPurchaseDemandAllocationSupplier(
    withSplit,
    null,
    withSplit
      .find((draft) => draft.supplierId == null)
      ?.lines.find((line) => line.requestItemId === 11)?.key ?? "",
    2,
    [supplierA, supplierB],
  );
  assert.equal(
    reassigned.some(
      (draft) =>
        draft.supplierId === 2 &&
        draft.lines.some((line) => line.requestItemId === 11),
    ),
    true,
  );

  const reduced = removePurchaseDemandAllocationRow(
    reassigned,
    2,
    reassigned
      .find((draft) => draft.supplierId === 2)
      ?.lines.find((line) => line.requestItemId === 11)?.key ?? "",
  );
  assert.equal(
    reduced.flatMap((draft) =>
      draft.lines.filter((line) => line.requestItemId === 11),
    ).length,
    1,
  );
});

test("purchase request reports remaining ingredients without an active supplier mapping", () => {
  const unassigned = findUnassignedPurchaseRequestItemIds(
    [
      { id: 11, ingredientId: 101, remainingQuantity: 5 },
      { id: 12, ingredientId: 102, remainingQuantity: 0 },
      { id: 13, ingredientId: 103, remainingQuantity: 2 },
    ],
    [supplierA],
  );

  assert.deepEqual(unassigned, [13]);
});
