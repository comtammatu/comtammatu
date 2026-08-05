import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTransferLinesPayload,
  clampTransferLineForSource,
  getTransferOutboundDestinationOptions,
  getTransferSelectableIngredients,
  getTransferSourceLocationOptions,
  parseTransferTargetValue,
  resolveTransferCreatePolicy,
  type BranchForTransfer,
  type TransferDraftLine,
  type TransferIngredientOption,
} from "../lib/inventory/transfer-create-model";

const branches: BranchForTransfer[] = [
  { id: 10, name: "Chi nhanh A", branch_kind: "branch", is_active: true },
  {
    id: 20,
    name: "Kho Tong",
    branch_kind: "central_supply",
    is_active: true,
  },
  {
    id: 30,
    name: "Bep Trung Tam",
    branch_kind: "central_kitchen",
    is_active: true,
  },
  { id: 40, name: "Chi nhanh B", branch_kind: "branch", is_active: true },
  { id: 50, name: "Chi nhanh C", branch_kind: "branch", is_active: false },
];

const ingredient: TransferIngredientOption = {
  id: 100,
  name: "Gao",
  is_active: true,
  itemKind: "raw_material",
  units: [
    {
      id: 1001,
      unit_id: 1,
      unit_code: "kg",
      unit_name: "kg",
      to_base_factor: 1,
      is_base: true,
      is_active: true,
      sort_order: 0,
    },
    {
      id: 1002,
      unit_id: 2,
      unit_code: "bao",
      unit_name: "Bao",
      to_base_factor: 5,
      is_base: false,
      is_active: true,
      sort_order: 1,
    },
  ],
};

function makeLine(patch: Partial<TransferDraftLine> = {}): TransferDraftLine {
  return {
    key: "line-1",
    ingredientId: ingredient.id,
    name: ingredient.name,
    quantity: "2",
    unit: "Bao",
    entryUnitId: "2",
    ...patch,
  };
}

test("branch warehouse outbound destinations include Central Kitchen and active branches", () => {
  const policy = resolveTransferCreatePolicy({
    branches,
    userBranchId: 10,
  });

  assert.equal(policy.canCreateOutbound, true);
  assert.deepEqual(
    policy.outboundDestinationOptions.map((option) => option.value),
    ["30:warehouse", "40:warehouse"],
  );
});

test("branch source has no same-branch kitchen destination after D091", () => {
  assert.deepEqual(
    getTransferOutboundDestinationOptions({
      branches,
      sourceBranchId: 10,
      sourceBranchKind: "branch",
      sourceLocationKind: "warehouse",
    }).map((option) => option.value),
    ["30:warehouse", "40:warehouse"],
  );
});

test("central supply can dispatch to active branch warehouses and Central Kitchen", () => {
  const policy = resolveTransferCreatePolicy({
    branches,
    userBranchId: 20,
  });

  assert.equal(policy.canCreateOutbound, true);
  assert.deepEqual(
    policy.outboundDestinationOptions.map((option) => option.value),
    ["10:warehouse", "30:warehouse", "40:warehouse"],
  );
});

test("Central Kitchen dispatches finished goods to branches and can return stock to Kho Tổng", () => {
  assert.deepEqual(
    getTransferSourceLocationOptions({
      locations: [
        { id: 301, branchId: 30, kind: "warehouse", isDefaultIssue: true },
      ],
    }).map((location) => location.id),
    [301],
  );

  assert.deepEqual(
    getTransferOutboundDestinationOptions({
      branches,
      sourceBranchId: 30,
      sourceBranchKind: "central_kitchen",
      sourceLocationKind: "warehouse",
    }).map((option) => option.value),
    ["10:warehouse", "20:warehouse", "40:warehouse"],
  );

  assert.deepEqual(
    getTransferSelectableIngredients({
      ingredients: [
        ingredient,
        {
          id: 101,
          name: "Suon da nuong",
          is_active: true,
          itemKind: "finished_good",
        },
        {
          id: 102,
          name: "Bi da ngung ban",
          is_active: false,
          itemKind: "finished_good",
        },
      ],
      sourceBranchKind: "central_kitchen",
    }).map((item) => item.id),
    [101],
  );

  assert.deepEqual(
    getTransferSelectableIngredients({
      ingredients: [
        ingredient,
        {
          id: 101,
          name: "Suon da nuong",
          is_active: true,
          itemKind: "finished_good",
        },
      ],
      sourceBranchKind: "central_kitchen",
      targetBranchKind: "central_supply",
    }).map((item) => item.id),
    [100, 101],
  );
});

test("target parser rejects malformed route values", () => {
  assert.equal(parseTransferTargetValue("40:kitchen"), null);
  assert.equal(parseTransferTargetValue("0:warehouse"), null);
  assert.equal(parseTransferTargetValue("40:office"), null);
  assert.equal(parseTransferTargetValue("branch:kitchen"), null);
});

test("line payload converts entry units against the selected source location stock", () => {
  assert.deepEqual(
    buildTransferLinesPayload({
      lines: [makeLine()],
      ingredients: [ingredient],
      sourceStockByLocation: { 200: { 100: 10 } },
      sourceLocationId: 200,
    }),
    {
      success: true,
      lines: [{ ingredientId: 100, quantity: 2, entryUnitId: 2 }],
    },
  );

  assert.deepEqual(
    buildTransferLinesPayload({
      lines: [makeLine({ quantity: "2.1" })],
      ingredients: [ingredient],
      sourceStockByLocation: { 200: { 100: 10 } },
      sourceLocationId: 200,
    }),
    { success: false, error: "exceeds_stock" },
  );
});

test("line payload rejects invalid quantities and unit ids", () => {
  for (const line of [
    makeLine({ quantity: "0" }),
    makeLine({ quantity: "not-a-number" }),
    makeLine({ entryUnitId: "invalid" }),
  ]) {
    assert.deepEqual(
      buildTransferLinesPayload({
        lines: [line],
        ingredients: [ingredient],
        sourceStockByLocation: { 200: { 100: 10 } },
        sourceLocationId: 200,
      }),
      { success: false, error: "invalid_line" },
    );
  }
});

test("line payload rejects an empty transfer", () => {
  assert.deepEqual(
    buildTransferLinesPayload({
      lines: [],
      ingredients: [ingredient],
      sourceStockByLocation: { 200: { 100: 10 } },
      sourceLocationId: 200,
    }),
    { success: false, error: "empty_lines" },
  );
});

test("changing source clamps the selected active unit to available stock", () => {
  assert.equal(
    clampTransferLineForSource({
      line: makeLine({ quantity: "3" }),
      ingredients: [ingredient],
      sourceStockByLocation: { 200: { 100: 10 } },
      sourceLocationId: 200,
    }).quantity,
    "2",
  );
  assert.deepEqual(
    buildTransferLinesPayload({
      lines: [makeLine({ unit: "kg", entryUnitId: "1" })],
      ingredients: [ingredient],
      sourceStockByLocation: { 200: { 100: 10 } },
      sourceLocationId: 200,
    }),
    {
      success: true,
      lines: [{ ingredientId: 100, quantity: 2, entryUnitId: 1 }],
    },
  );
});
