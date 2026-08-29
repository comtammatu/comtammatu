import assert from "node:assert/strict";
import { test } from "node:test";
import {
  previewWasteLineTierFromReason,
  previewWasteTier,
} from "../lib/inventory/waste-tier-model";

const baseline = {
  value: 1,
  baseQuantity: 1,
  availableQuantity: 100,
  reasonCode: "spoiled",
  projectedShiftSum: 1,
  projectedBranchSum: 1,
  branchCap: 5_000_000,
  rollingSum: null,
  pendingIngredientValue: 1,
};

test("waste tier preview requires photo at default tier-one value (500k)", () => {
  assert.deepEqual(previewWasteTier({ ...baseline, value: 500_000 }), {
    tier: 1,
    photoRequired: true,
    approvalRequired: false,
  });
  // Below 500k is Tier 0
  assert.deepEqual(previewWasteTier({ ...baseline, value: 499_999 }), {
    tier: 0,
    photoRequired: false,
    approvalRequired: false,
  });
});

test("waste tier preview supports custom configured settings", () => {
  assert.deepEqual(
    previewWasteTier({
      ...baseline,
      value: 150_000,
      settings: { tier1Threshold: 100_000 },
    }),
    {
      tier: 1,
      photoRequired: true,
      approvalRequired: false,
    },
  );
});

test("waste tier preview disables tier gating when tierEnabled is false", () => {
  assert.deepEqual(
    previewWasteTier({
      ...baseline,
      value: 10_000_000,
      reasonCode: "found_missing",
      settings: { tierEnabled: false },
    }),
    {
      tier: 0,
      photoRequired: false,
      approvalRequired: false,
    },
  );
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
      rollingSum: 499_999,
      pendingIngredientValue: 1,
    }),
    { tier: 1, photoRequired: true, approvalRequired: false },
  );
});

test("reason-only line preview respects enforceReasonRules setting", () => {
  assert.deepEqual(previewWasteLineTierFromReason("spoiled"), {
    tier: 0,
    photoRequired: false,
    approvalRequired: false,
  });
  // By default, enforceReasonRules is false, so dropped is Tier 0
  assert.deepEqual(previewWasteLineTierFromReason("dropped"), {
    tier: 0,
    photoRequired: false,
    approvalRequired: false,
  });
  // When enforceReasonRules is true, dropped is Tier 1
  assert.deepEqual(
    previewWasteLineTierFromReason("dropped", { enforceReasonRules: true }),
    {
      tier: 1,
      photoRequired: true,
      approvalRequired: false,
    },
  );
  assert.deepEqual(previewWasteLineTierFromReason("theft_suspected"), {
    tier: 2,
    photoRequired: true,
    approvalRequired: true,
  });
});

