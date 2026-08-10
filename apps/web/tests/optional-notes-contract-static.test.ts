import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("generic operational notes are not collected by new records", () => {
  const purchaseRequests = read(
    "app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const supplierDialog = read(
    "app/(protected)/inventory/suppliers/supplier-dialog.tsx",
  );
  const wasteForm = read(
    "app/(protected)/inventory/waste/waste-operational-form.tsx",
  );

  assert.doesNotMatch(
    purchaseRequests,
    /purchase-request-notes|purchase-order-notes|poNotes|setNotes/,
  );
  assert.doesNotMatch(supplierDialog, /name="notes"|values\.notes/);
  assert.doesNotMatch(wasteForm, /slipNotesLabel|notes:\s*notes/);
  assert.match(wasteForm, /lineNotesLabel/);
});

test("rejections and audit-sensitive changes require a reason at both boundaries", () => {
  const wasteActions = read("app/(protected)/inventory/waste-actions.ts");
  const branchWasteApprovals = read(
    "app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx",
  );
  const ownerWasteApprovals = read(
    "app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );
  const expenseActions = read("app/(protected)/finance/expense-actions.ts");
  const expenseFormSchema = read(
    "app/(protected)/finance/expenses/expense-form-schema.ts",
  );
  const payrollActions = read("app/(protected)/hr/payroll-actions.ts");
  const payrollClient = read(
    "app/(protected)/hr/payroll/payroll-list-client.tsx",
  );
  const attendanceActions = read("app/(protected)/hr/actions.ts");
  const attendanceTable = read("app/(protected)/hr/attendance/attendance-table.tsx");
  const teamBoard = read(
    "app/(protected)/br/[branchId]/(operator)/team/team-board-client.tsx",
  );
  const creditActions = read(
    "app/(protected)/finance/supplier-invoice-actions.ts",
  );
  const creditFormSchema = read(
    "app/(protected)/finance/supplier-invoices/supplier-invoice-form-schema.ts",
  );

  assert.match(wasteActions, /data\.decision === "rejected"/);
  assert.match(wasteActions, /Lý do từ chối phải có ít nhất 5 ký tự/);
  assert.match(branchWasteApprovals, /<ReasonConfirmDialog/);
  assert.match(ownerWasteApprovals, /<ReasonConfirmDialog/);

  for (const source of [
    expenseActions,
    expenseFormSchema,
    payrollActions,
    payrollClient,
    attendanceActions,
    creditActions,
    creditFormSchema,
  ]) {
    assert.match(source, /\.min\(5,/);
  }
  assert.match(attendanceTable, /name="note"[\s\S]{0,180}required/);
  assert.match(teamBoard, /<ReasonConfirmDialog/);
  assert.doesNotMatch(attendanceActions, /Force closed: Quên kết ca/);
});
