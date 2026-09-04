import assert from "node:assert/strict";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";
import { resolveWorkTaskDocumentLink } from "../app/(protected)/work/_lib/document-links.ts";

const webRoot = process.cwd();

function readWeb(path: string): string {
  return readSql(webRoot, path);
}

test("resolveWorkTaskDocumentLink correctly parses operational document links", () => {
  // 1. POS Session with branch
  const posWithBranch = resolveWorkTaskDocumentLink({
    title: "[Sự cố - Tiền két] Ca POS #42 tại Chi nhánh #3 lệch -120.000đ",
    description: "Chi nhánh: Quận 1 (Mã: #3)",
  });
  assert.ok(posWithBranch);
  assert.equal(posWithBranch.type, "pos_session");
  assert.equal(posWithBranch.id, "42");
  assert.equal(posWithBranch.href, "/br/3/pos-sessions?session=42");

  // 2. POS Session without branch
  const posWithoutBranch = resolveWorkTaskDocumentLink({
    title: "Ca POS #99 cần kiểm tra lại két tiền",
  });
  assert.ok(posWithoutBranch);
  assert.equal(posWithoutBranch.type, "pos_session");
  assert.equal(posWithoutBranch.id, "99");
  assert.equal(posWithoutBranch.href, "/reports/pos-sessions?session=99");

  // 3. Customer Feedback
  const feedback = resolveWorkTaskDocumentLink({
    title: "[Sự cố - CSKH] Đánh giá 1 sao - Bàn 4",
    description: "ID Phản hồi: #512",
  });
  assert.ok(feedback);
  assert.equal(feedback.type, "feedback");
  assert.equal(feedback.id, "512");
  assert.equal(feedback.href, "/feedback");

  // 4. Inventory count slip
  const countSlip = resolveWorkTaskDocumentLink({
    title: "Giải trình Phiếu kiểm kê #77 lệch nguyên liệu",
  });
  assert.ok(countSlip);
  assert.equal(countSlip.type, "count_slip");
  assert.equal(countSlip.id, "77");
  assert.equal(countSlip.href, "/inventory");

  // 5. Stock issue slip
  const stockIssue = resolveWorkTaskDocumentLink({
    title: "Kiểm tra Phiếu xuất #105 hủy sườn",
  });
  assert.ok(stockIssue);
  assert.equal(stockIssue.type, "stock_issue");
  assert.equal(stockIssue.id, "105");
  assert.equal(stockIssue.href, "/inventory/issues/105");

  // 6. GRN slip
  const grn = resolveWorkTaskDocumentLink({
    title: "Đối chiếu Phiếu nhập #88 với hóa đơn VAT",
  });
  assert.ok(grn);
  assert.equal(grn.type, "grn");
  assert.equal(grn.id, "88");
  assert.equal(grn.href, "/inventory/grn/88");

  // 7. General task
  const general = resolveWorkTaskDocumentLink({
    title: "Họp giao ban đầu tuần",
    description: "Phòng họp lớn",
  });
  assert.equal(general, null);
});

test("Work task actions export attachment mutations", () => {
  const actions = readWeb("app/(protected)/work/actions.ts");
  assert.match(actions, /export const addWorkTaskAttachment = withAction/);
  assert.match(actions, /export const deleteWorkTaskAttachment = withAction/);
  assert.match(actions, /export async function uploadWorkTaskAttachmentFile/);
  assert.match(actions, /work_task_attachments/);
});

test("Work detail panel integrates attachments and document links", () => {
  const panel = readWeb(
    "app/(protected)/work/_components/work-task-detail-panel.tsx",
  );
  assert.match(panel, /resolveWorkTaskDocumentLink/);
  assert.match(panel, /workCopy\.attachmentsTitle/);
  assert.match(panel, /workCopy\.relatedDocument/);
  assert.match(panel, /handleUploadFile/);
  assert.match(panel, /handleDeleteAttachment/);
});

test("POS session close action auto-creates incident on cash difference >= 100k", () => {
  const sessionActions = readWeb(
    "app/(protected)/br/[branchId]/pos/session-actions.ts",
  );
  assert.match(sessionActions, /Math\.abs\(cashDiff\) >= 100_000/);
  assert.match(sessionActions, /create_branch_incident_task/);
  assert.match(sessionActions, /Sự cố - Tiền két/);
});

test("BranchIncidentDialog includes photo capture and upload", () => {
  const dialog = readWeb(
    "app/(protected)/br/[branchId]/_components/branch-incident-dialog.tsx",
  );
  assert.match(dialog, /photoUrl/);
  assert.match(dialog, /capture="environment"/);
  assert.match(dialog, /uploadBranchIncidentPhotoAction/);
});

test("Work task actions support setWorkTaskDepartment and relaxed scoped listing", () => {
  const actions = readWeb("app/(protected)/work/actions.ts");
  assert.match(actions, /export const setWorkTaskDepartment = withAction/);
  assert.match(actions, /task\.department_changed/);
  assert.match(actions, /scopedWorkTasksSchema = z\.object/);
  // Ensure refine requirement of exactly one was removed
  assert.doesNotMatch(actions, /Exactly one of departmentId or projectId is required/);
});

test("WorkBoard organizes by department with collapsible done section and status badge dropdown", () => {
  const board = readWeb("app/(protected)/work/_components/work-board.tsx");
  assert.match(board, /departments/);
  assert.match(board, /renderDepartmentColumn/);
  assert.match(board, /moveTaskDepartment/);
  assert.match(board, /setWorkTaskDepartment/);
  assert.match(board, /collapsedDone/);
  assert.match(board, /doneSectionToggle/);
  assert.match(board, /addDepartmentTask/);
  assert.match(board, /WorkCreateDialog/);
  assert.match(board, /DropdownMenu/);
  assert.match(board, /DropdownMenuTrigger/);
  assert.match(board, /DropdownMenuContent/);
  assert.match(board, /DropdownMenuItem/);
  assert.match(board, /getStatusBadgeProps/);
  assert.match(board, /moveTaskStatus/);
});

