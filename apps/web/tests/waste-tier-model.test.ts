import assert from "node:assert/strict";
import { test } from "node:test";
import { previewWasteLineTierFromReason, previewWasteTier } from "../lib/inventory/waste-tier-model";

const baseline = {
  value: 1,
  baseQuantity: 1,
  availableQuantity: 100,
  reasonCode: "spoiled",
  projectedShiftSum: 1,
  projectedBranchSum: 1,
  branchCap: 500_000,
  rollingSum: null,
  pendingIngredientValue: 1,
};

test("waste tier preview requires photo at the tier-one value", () => {
  assert.deepEqual(previewWasteTier({ ...baseline, value: 150_000 }), {
    tier: 1,
    photoRequired: true,
    approvalRequired: false,
  });
});

test("waste tier preview preserves always-tier-two reasons", () => {
  assert.deepEqual(
    previewWasteTier({ ...baseline, reasonCode: "found_missing" }),
    { tier: 2, photoRequired: true, approvalRequired: true },
  );
});

test("waste tier preview applies the rolling evidence threshold", () => {
  assert.deepEqual(
    previewWasteTier({
      ...baseline,
      rollingSum: 149_999,
      pendingIngredientValue: 1,
    }),
    { tier: 1, photoRequired: true, approvalRequired: false },
  );
});

test("reason-only line preview stays conservative without WAC", () => {
  assert.deepEqual(previewWasteLineTierFromReason("spoiled"), {
    tier: 0,
    photoRequired: false,
    approvalRequired: false,
  });
  assert.deepEqual(previewWasteLineTierFromReason("dropped"), {
    tier: 1,
    photoRequired: true,
    approvalRequired: false,
  });
  assert.deepEqual(previewWasteLineTierFromReason("theft_suspected"), {
    tier: 2,
    photoRequired: true,
    approvalRequired: true,
  });
});
