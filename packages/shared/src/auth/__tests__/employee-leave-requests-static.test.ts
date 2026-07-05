import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Employee leave migration uses branch-scoped RLS and RPC workflow", () => {
  const migration = read(
    "supabase/migrations/_archive/20260610110000_employee_leave_requests.sql",
  );

  for (const expected of [
    "'hr:request_leave'",
    "'hr:approve_leave_request'",
    "CREATE TABLE public.leave_requests",
    "CONSTRAINT leave_requests_date_range_check CHECK (start_date <= end_date)",
    "ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY",
    "CREATE POLICY leave_requests_select",
    "CREATE POLICY leave_requests_self_insert",
    "CREATE POLICY leave_requests_manager_update",
    "public.has_permission(branch_id, 'hr:request_leave')",
    "public.has_permission(branch_id, 'hr:approve_leave_request')",
    "GRANT SELECT ON TABLE public.leave_requests TO authenticated",
    "GRANT ALL ON TABLE public.leave_requests TO service_role",
    "CREATE OR REPLACE FUNCTION public.submit_leave_request",
    "CREATE OR REPLACE FUNCTION public.cancel_leave_request",
    "CREATE OR REPLACE FUNCTION public.approve_leave_request",
    "CREATE OR REPLACE FUNCTION public.reject_leave_request",
    "SECURITY DEFINER",
    "SET search_path = public, pg_temp",
    "pg_advisory_xact_lock(v_employee_id)",
    "daterange(lr.start_date, lr.end_date, '[]')",
    "cannot review own request",
    "Does not mutate attendance or payroll",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  for (const fn of [
    "submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT)",
    "cancel_leave_request(BIGINT)",
    "approve_leave_request(BIGINT)",
    "reject_leave_request(BIGINT, TEXT)",
  ]) {
    assert.ok(
      migration.includes(
        `REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon`,
      ) &&
        migration.includes(
          `GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated, service_role`,
        ),
      `expected explicit function ACL for ${fn}`,
    );
  }
});

test("Employee leave permission and generated type mirrors are wired", () => {
  const permissions = read("packages/shared/src/auth/permissions.ts");
  const dbTypes = read("packages/database/src/types/database.types.ts");

  for (const expected of [
    'HR_REQUEST_LEAVE: "hr:request_leave"',
    'HR_APPROVE_LEAVE_REQUEST: "hr:approve_leave_request"',
    "PERMISSION_KEY_COUNT = 92",
  ]) {
    assert.ok(permissions.includes(expected), `expected ${expected}`);
  }

  for (const expected of [
    "leave_requests: {",
    "leave_type: string",
    "approve_leave_request",
    "cancel_leave_request",
    "reject_leave_request",
    "submit_leave_request",
  ]) {
    assert.ok(dbTypes.includes(expected), `expected ${expected}`);
  }
});

test("Cổng nhân viên exposes leave request self-service from Schedule", () => {
  const schedule = read("apps/web/lib/employee/schedule/page.tsx");
  const page = read("apps/web/lib/employee/leave/page.tsx");
  const client = read("apps/web/lib/employee/leave/leave-client.tsx");
  const actions = read("apps/web/lib/employee/leave/actions.ts");
  const messages = read("apps/web/lib/messages/employee.ts");

  for (const expected of ['leaveHref = "/br"', '.from("leave_requests")']) {
    assert.ok(schedule.includes(expected), `expected schedule ${expected}`);
  }

  for (const expected of [
    '.from("leave_requests")',
    '.eq("employee_id", ctx.employeeId)',
    "LeaveRequestClient",
    "EmployeeMissingProfileEmpty",
  ]) {
    assert.ok(page.includes(expected), `expected page ${expected}`);
  }

  for (const expected of [
    "submitLeaveRequest",
    "cancelLeaveRequest",
    "Textarea",
    "LEAVE_TYPE_LABELS_VI",
    'status === "pending"',
  ]) {
    assert.ok(client.includes(expected), `expected client ${expected}`);
  }

  for (const expected of [
    "PERMISSION_KEYS.HR_REQUEST_LEAVE",
    "permissionBranchId: (data) => data.branchId",
    '"submit_leave_request"',
    '"cancel_leave_request"',
    "Không thể gửi yêu cầu nghỉ",
  ]) {
    assert.ok(actions.includes(expected), `expected action ${expected}`);
  }

  assert.ok(
    messages.includes("leave: {") && messages.includes('title: "Nghỉ phép"'),
    "expected Employee messages to define leave copy",
  );
});

test("HRM exposes branch-scoped leave approval tab", () => {
  const hrClient = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const table = read("apps/web/app/(protected)/hr/leave-requests-table.tsx");
  const actions = read("apps/web/app/(protected)/hr/leave-request-actions.ts");
  const messages = read("apps/web/lib/messages/hr.ts");

  for (const expected of ["LeaveRequestsTable", "copy.tabs.attendance"]) {
    assert.ok(hrClient.includes(expected), `expected HR client ${expected}`);
  }
  // HR tabs migrated from raw TabsTrigger to AppPageTabs items; the
  // attendance tab is declared as an items entry with its content body.
  assert.match(
    hrClient,
    /value:\s*"attendance",\s*label:\s*copy\.tabs\.attendance/,
    "attendance tab must be declared in the AppPageTabs items list",
  );
  assert.match(
    hrClient,
    /<TabsContent value="attendance"/,
    "attendance tab must render its content body",
  );
  assert.ok(
    !/value:\s*"leave"/.test(hrClient) &&
      !hrClient.includes('TabsContent value="leave"'),
    "leave approval must stay inside HR attendance flow, not add a separate Employee-style HR tab",
  );

  for (const expected of [
    "fetchLeaveRequests",
    "approveLeaveRequest",
    "rejectLeaveRequest",
    "Textarea",
    "copy.emptyPendingTitle",
    'status !== "pending"',
  ]) {
    assert.ok(table.includes(expected), `expected leave table ${expected}`);
  }

  for (const expected of [
    "PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST",
    "permissionBranchId: (data) => data.branchId",
    '"approve_leave_request"',
    '"reject_leave_request"',
    "requireBranchScope: true",
    "Không thể tự duyệt yêu cầu của mình.",
  ]) {
    assert.ok(actions.includes(expected), `expected HR action ${expected}`);
  }

  assert.ok(
    messages.includes("nghỉ phép"),
    "expected HR workspace copy to mention leave",
  );
});
