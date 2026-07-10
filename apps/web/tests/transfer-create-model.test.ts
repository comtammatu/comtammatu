import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTransferLinesPayload,
  clampTransferLineForSource,
  formatTransferOption,
  getTransferSourceBranchIds,
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

test("branch manager creates inbound requests only from self or central sites", () => {
  const policy = resolveTransferCreatePolicy({
    branches,
    userBranchId: 10,
    userRole: "branch_manager",
  });

  assert.equal(policy.canCreateInboundRequest, true);
  assert.equal(policy.canCreateOutbound, false);
  assert.equal(policy.requestDestinationBranchId, 10);
  assert.deepEqual(
    policy.inboundSourceOptions.map((branch) => branch.id),
    [10, 20, 30],
  );
  assert.deepEqual(policy.outboundDestinationOptions, []);
  assert.equal(formatTransferOption(branches[0]!, 10), "Chi nhanh A · Kho");
});

test("branch warehouse outbound destinations include Central Kitchen and active branches", () => {
  const policy = resolveTransferCreatePolicy({
    branches,
    userBranchId: 10,
    userRole: "warehouse_manager",
  });

  assert.equal(policy.canCreateOutbound, true);
  assert.equal(policy.canCreateInboundRequest, false);
  assert.deepEqual(
    policy.outboundDestinationOptions.map((option) => option.value),
    ["10:kitchen", "30:warehouse", "40:warehouse", "40:kitchen"],
  );
});

test("central operators can dispatch only to active branch warehouse or kitchen targets", () => {
  const policy = resolveTransferCreatePolicy({
    branches,
    userBranchId: 20,
    userRole: "warehouse_manager",
  });

  assert.equal(policy.canCreateOutbound, true);
  assert.deepEqual(
    policy.outboundDestinationOptions.map((option) => option.value),
    ["10:warehouse", "10:kitchen", "40:warehouse", "40:kitchen"],
  );
});

test("source stock loader scope follows the operator role", () => {
  assert.deepEqual(
    getTransferSourceBranchIds({
      branches,
      userBranchId: 10,
      userRole: "branch_manager",
    }),
    [10, 20, 30],
  );
  assert.deepEqual(
    getTransferSourceBranchIds({
      branches,
      userBranchId: 20,
      userRole: "warehouse_manager",
    }),
    [20],
  );
});

test("target parser rejects malformed route values", () => {
  assert.deepEqual(parseTransferTargetValue("40:kitchen"), {
    branchId: 40,
    kind: "kitchen",
  });
  assert.equal(parseTransferTargetValue("0:warehouse"), null);
  assert.equal(parseTransferTargetValue("40:office"), null);
  assert.equal(parseTransferTargetValue("branch:kitchen"), null);
});

test("line payload converts entry units against the selected source stock", () => {
  assert.deepEqual(
    buildTransferLinesPayload({
      lines: [makeLine()],
      ingredients: [ingredient],
      sourceStockByBranch: { 20: { 100: 10 } },
      sourceBranchId: 20,
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
      sourceStockByBranch: { 20: { 100: 10 } },
      sourceBranchId: 20,
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
        sourceStockByBranch: { 20: { 100: 10 } },
        sourceBranchId: 20,
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
      sourceStockByBranch: { 20: { 100: 10 } },
      sourceBranchId: 20,
    }),
    { success: false, error: "empty_lines" },
  );
});

test("changing source or entry unit clamps the draft to available stock", () => {
  assert.equal(
    clampTransferLineForSource({
      line: makeLine({ quantity: "3" }),
      ingredients: [ingredient],
      sourceStockByBranch: { 20: { 100: 10 } },
      sourceBranchId: 20,
    }).quantity,
    "2",
  );
  assert.equal(
    clampTransferLineForSource({
      line: makeLine({ quantity: "11", unit: "kg", entryUnitId: "1" }),
      ingredients: [ingredient],
      sourceStockByBranch: { 20: { 100: 10 } },
      sourceBranchId: 20,
    }).quantity,
    "10",
  );
});
