import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canProgressBranchSupplierReturn,
  filterBranchSupplierReturns,
  toBranchSupplierReturnStatus,
  type BranchSupplierReturn,
} from "../lib/inventory/supplier-return-model";

const draftReturn: BranchSupplierReturn = {
  id: 1,
  code: "THNCC-1",
  status: "draft",
  reason: "damaged",
  resolution: "credit_note",
  createdAt: "2026-07-10T01:00:00.000Z",
  sentAt: null,
  notes: null,
  branchId: 1,
  supplierName: "NCC A",
  grnId: 11,
  grnNumber: "GRN-11",
};

const sentReturn: BranchSupplierReturn = {
  ...draftReturn,
  id: 2,
  code: "THNCC-2",
  status: "sent",
  supplierName: "NCC B",
  resolution: "cash_refund",
};

test("supplier return status mapping fails closed for unknown values", () => {
  assert.equal(toBranchSupplierReturnStatus("draft"), "draft");
  assert.equal(toBranchSupplierReturnStatus("credited"), "credited");
  assert.equal(toBranchSupplierReturnStatus("reopened"), "unknown");
});

test("supplier return list filter preserves fixed-branch operational references", () => {
  assert.deepEqual(
    filterBranchSupplierReturns([draftReturn, sentReturn], {
      query: "ncc b",
      status: "all",
    }).map((returnRecord) => returnRecord.code),
    ["THNCC-2"],
  );
  assert.deepEqual(
    filterBranchSupplierReturns([draftReturn, sentReturn], {
      query: "",
      status: "draft",
    }).map((returnRecord) => returnRecord.code),
    ["THNCC-1"],
  );
});

test("supplier return actions stop for final or unknown status", () => {
  assert.equal(
    canProgressBranchSupplierReturn({
      returnRecord: draftReturn,
      lines: [],
      canConfirm: true,
    }),
    true,
  );
  assert.equal(
    canProgressBranchSupplierReturn({
      returnRecord: sentReturn,
      lines: [],
      canConfirm: true,
    }),
    true,
  );
  assert.equal(
    canProgressBranchSupplierReturn({
      returnRecord: { ...sentReturn, status: "credited" },
      lines: [],
      canConfirm: true,
    }),
    false,
  );
  assert.equal(
    canProgressBranchSupplierReturn({
      returnRecord: { ...sentReturn, status: "unknown" },
      lines: [],
      canConfirm: true,
    }),
    false,
  );
});
