import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canConfirmBranchStockIssue,
  filterBranchStockIssues,
  isBranchInternalIssueType,
  isBranchStockIssueType,
  toBranchStockIssueStatus,
  type BranchStockIssue,
  type BranchStockIssueLine,
} from "../lib/inventory/stock-issue-model";

function makeIssue(patch: Partial<BranchStockIssue> = {}): BranchStockIssue {
  return {
    id: 1,
    code: "HH-001",
    type: "writeoff",
    status: "draft",
    issuedAt: "2026-07-10T03:00:00.000Z",
    notes: null,
    branchId: 2,
    ...patch,
  };
}

function makeLine(
  patch: Partial<BranchStockIssueLine> = {},
): BranchStockIssueLine {
  return {
    id: 1,
    ingredientId: 7,
    ingredientName: "Sườn",
    quantity: 2,
    unit: "kg",
    entryUnitId: 3,
    reason: "Hàng hỏng",
    photoUrls: [],
    ...patch,
  };
}

test("Branch issue model accepts only consumption and writeoff", () => {
  assert.equal(toBranchStockIssueStatus("unexpected"), "draft");
  assert.equal(isBranchStockIssueType("consumption"), true);
  assert.equal(isBranchStockIssueType("writeoff"), true);
  assert.equal(isBranchStockIssueType("other"), false);
  assert.equal(isBranchInternalIssueType("writeoff"), true);
  assert.equal(isBranchInternalIssueType("consumption"), false);
  assert.equal(isBranchInternalIssueType("other"), false);
});

test("Branch issue filters retain fixed-branch draft and final records", () => {
  const issues = [
    makeIssue(),
    makeIssue({
      id: 2,
      code: "HH-002",
      type: "writeoff",
      status: "confirmed",
      notes: "Hủy hàng hỏng",
    }),
  ];

  assert.deepEqual(
    filterBranchStockIssues(issues, { query: "002", status: "all" }).map(
      (issue) => issue.id,
    ),
    [2],
  );
  assert.deepEqual(
    filterBranchStockIssues(issues, { query: "", status: "draft" }).map(
      (issue) => issue.id,
    ),
    [1],
  );
});

test("Branch issue confirmation requires authority, a draft, and reasons", () => {
  const issue = makeIssue();
  assert.equal(
    canConfirmBranchStockIssue({ issue, lines: [makeLine()], canManage: true }),
    true,
  );
  assert.equal(
    canConfirmBranchStockIssue({
      issue,
      lines: [makeLine({ reason: " " })],
      canManage: true,
    }),
    false,
  );
  assert.equal(
    canConfirmBranchStockIssue({ issue, lines: [], canManage: true }),
    false,
  );
  assert.equal(
    canConfirmBranchStockIssue({
      issue,
      lines: [makeLine()],
      canManage: false,
    }),
    false,
  );
  assert.equal(
    canConfirmBranchStockIssue({
      issue: makeIssue({ status: "confirmed" }),
      lines: [makeLine()],
      canManage: true,
    }),
    false,
  );
});
