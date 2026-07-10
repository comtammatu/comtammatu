import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getTransferActionConfig,
  isTransferReceiveReady,
  type TransferDetail,
} from "../lib/inventory/transfer-detail-model";

function makeTransfer(patch: Partial<TransferDetail> = {}): TransferDetail {
  return {
    id: 1,
    code: "TRF-001",
    status: "draft",
    fromBranchId: 10,
    toBranchId: 20,
    fromBranch: "Kho A",
    toBranch: "Kho B",
    fromLocation: "Kho A",
    toLocation: "Kho B",
    createdBy: "—",
    date: "10/07/2026",
    note: null,
    subtotal: 0,
    shipping: 0,
    total: 0,
    items: [],
    ...patch,
  };
}

test("branch manager only confirms an intra-branch kitchen request", () => {
  const intraBranch = makeTransfer({ toBranchId: 10 });
  assert.deepEqual(
    getTransferActionConfig({
      transfer: intraBranch,
      userRole: "branch_manager",
      userBranchId: 10,
    }),
    { kind: "confirm_kitchen", enabled: true },
  );

  assert.deepEqual(
    getTransferActionConfig({
      transfer: makeTransfer(),
      userRole: "branch_manager",
      userBranchId: 20,
    }),
    { kind: "confirm_ship", enabled: false },
  );
});

test("warehouse roles can advance transfers only from their source branch", () => {
  const transfer = makeTransfer();
  assert.deepEqual(
    getTransferActionConfig({
      transfer,
      userRole: "warehouse_manager",
      userBranchId: 10,
    }),
    { kind: "confirm_ship", enabled: true },
  );
  assert.deepEqual(
    getTransferActionConfig({
      transfer,
      userRole: "warehouse_manager",
      userBranchId: 20,
    }),
    { kind: "confirm_ship", enabled: false },
  );

  assert.deepEqual(
    getTransferActionConfig({
      transfer: makeTransfer({ status: "confirmed_ship" }),
      userRole: "production_manager",
      userBranchId: 10,
    }),
    { kind: "mark_in_transit", enabled: true },
  );
});

test("receiving action follows the destination branch for scoped roles", () => {
  const transfer = makeTransfer({ status: "in_transit" });
  assert.deepEqual(
    getTransferActionConfig({
      transfer,
      userRole: "branch_manager",
      userBranchId: 20,
    }),
    { kind: "receive", enabled: true },
  );
  assert.deepEqual(
    getTransferActionConfig({
      transfer,
      userRole: "warehouse_manager",
      userBranchId: 10,
    }),
    { kind: "receive", enabled: false },
  );
});

test("terminal transfers expose no primary mutation", () => {
  for (const status of ["received", "completed", "cancelled"]) {
    assert.equal(
      getTransferActionConfig({
        transfer: makeTransfer({ status }),
        userRole: "owner",
        userBranchId: 10,
      }),
      null,
    );
  }
});

test("receive-ready status contract stays shared by Office and Branch", () => {
  assert.equal(isTransferReceiveReady("in_transit"), true);
  assert.equal(isTransferReceiveReady("confirmed_receive"), true);
  assert.equal(isTransferReceiveReady("confirmed_ship"), false);
  assert.equal(isTransferReceiveReady("received"), false);
});
