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

test("recorded consumption search matches order number and ingredient", () => {
  const rows: BranchRecordedConsumption[] = [
    {
      orderId: 10,
      orderNumber: "TC-10",
      recordedAt: "2026-07-10T03:00:00Z",
      locationName: "Kho chính",
      sourceKind: "pos",
      sourceLabel: "POS",
      ingredientCount: 2,
      lines: [
        {
          id: 1,
          ingredientName: "Gạo tấm",
          locationName: "Kho chính",
          quantity: 2,
          unit: "kg",
        },
        {
          id: 2,
          ingredientName: "Trứng",
          locationName: "Kho chính",
          quantity: 3,
          unit: "quả",
        },
      ],
    },
  ];
  assert.equal(filterBranchRecordedConsumptions(rows, "TC-10").length, 1);
  assert.equal(filterBranchRecordedConsumptions(rows, "gao tam").length, 1);
  assert.equal(filterBranchRecordedConsumptions(rows, "trung").length, 1);
  assert.equal(filterBranchRecordedConsumptions(rows, "không có").length, 0);
});
