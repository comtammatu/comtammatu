import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterBranchRecordedConsumptions,
  resolveBranchConsumptionSourceKind,
  type BranchRecordedConsumption,
} from "../lib/inventory/branch-consumption-model";

test("recorded consumption keeps POS, HRM, manual, and import sources distinct", () => {
  assert.equal(
    resolveBranchConsumptionSourceKind({
      orderId: 1,
      issueId: null,
      issueSourceType: null,
      reason: null,
    }),
    "pos",
  );
  assert.equal(
    resolveBranchConsumptionSourceKind({
      orderId: null,
      issueId: 2,
      issueSourceType: "hrm_consumption",
      reason: null,
    }),
    "hrm",
  );
  assert.equal(
    resolveBranchConsumptionSourceKind({
      orderId: null,
      issueId: 3,
      issueSourceType: "manual",
      reason: null,
    }),
    "manual",
  );
  assert.equal(
    resolveBranchConsumptionSourceKind({
      orderId: null,
      issueId: null,
      issueSourceType: null,
      reason: "matu-platform import:batch",
    }),
    "import",
  );
});

test("recorded consumption search includes source and linked issue code", () => {
  const rows: BranchRecordedConsumption[] = [
    {
      id: 1,
      issueId: 8,
      orderId: null,
      issueCode: "PXK-008",
      sourceKind: "manual",
      sourceLabel: "Thủ công · PXK-008",
      recordedAt: "2026-07-10T03:00:00Z",
      locationName: "Kho chính",
      ingredientName: "Gạo tấm",
      quantity: 2,
      unit: "kg",
      unitCost: 10000,
      totalCost: 20000,
    },
  ];
  assert.equal(filterBranchRecordedConsumptions(rows, "PXK-008").length, 1);
  assert.equal(filterBranchRecordedConsumptions(rows, "gao tam").length, 1);
  assert.equal(filterBranchRecordedConsumptions(rows, "không có").length, 0);
});
