import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canConfirmBranchStockIssue,
  filterBranchStockIssues,
  getBranchStockIssueCreateTypes,
  toBranchStockIssueStatus,
  type BranchStockIssue,
  type BranchStockIssueLine,
} from "../lib/inventory/stock-issue-model";

function makeIssue(patch: Partial<BranchStockIssue> = {}): BranchStockIssue {
  return {
    id: 1,
    code: "PXK-001",
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
    ...patch,
  };
}

test("Branch issue model only creates the permitted internal issue types", () => {
  assert.deepEqual(
    getBranchStockIssueCreateTypes({
      canCreateOther: true,
      canCreateWriteoff: true,
    }),
    ["writeoff", "other"],
  );
  assert.deepEqual(
    getBranchStockIssueCreateTypes({
      canCreateOther: false,
      canCreateWriteoff: true,
    }),
    ["writeoff"],
  );
  assert.deepEqual(
    getBranchStockIssueCreateTypes({
      canCreateOther: false,
      canCreateWriteoff: false,
    }),
    [],
  );
  assert.equal(toBranchStockIssueStatus("unexpected"), "draft");
});

test("Branch issue filters retain fixed-branch draft and final records", () => {
  const issues = [
    makeIssue(),
    makeIssue({
      id: 2,
      code: "PXK-002",
      type: "other",
      status: "confirmed",
      notes: "Xuất cấp bếp",
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
