import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Employee leave migration uses branch-scoped RLS and RPC workflow", () => {
  const migration = read(
    "supabase/migration-archive/20260610110000_employee_leave_requests.sql",
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

test("Current baseline keeps leave approval RPCs scoped to the request branch", () => {
  const baseline = read("supabase/migration-archive/20260727120000_baseline.sql");
  const approveStart = baseline.indexOf(
    "CREATE FUNCTION public.approve_leave_request",
  );
  const rejectStart = baseline.indexOf(
    "CREATE FUNCTION public.reject_leave_request",
  );
  assert.ok(approveStart >= 0, "approve RPC must exist in the baseline");
  assert.ok(rejectStart >= 0, "reject RPC must exist in the baseline");
  const approveBody = baseline.slice(approveStart, rejectStart);
  const rejectBody = baseline.slice(
    rejectStart,
    baseline.indexOf(
      "COMMENT ON FUNCTION public.reject_leave_request",
      rejectStart,
    ),
  );

  for (const [name, body] of [
    ["approve", approveBody],
    ["reject", rejectBody],
  ] as const) {
    assert.match(
      body,
      /SELECT \* INTO v_request\s+FROM public\.leave_requests\s+WHERE id = p_request_id\s+AND tenant_id = v_tenant_id\s+FOR UPDATE;/,
      `${name} RPC must lock the actual leave request row`,
    );
    assert.ok(
      body.includes(
        "public.has_permission(v_request.branch_id, 'hr:approve_leave_request')",
      ),
      `${name} RPC must authorize against the request branch`,
    );
    assert.ok(
      body.includes("cannot review own request"),
      `${name} RPC must block self-review`,
    );
  }
});

test("Employee leave permission and generated type mirrors are wired", () => {
  const permissions = read("packages/shared/src/auth/permissions.ts");
  const dbTypes = read("packages/database/src/types/database.types.ts");
  const seed = read("apps/web/tests/fixtures/supabase-e2e/tenant.sql");

  for (const expected of [
    'HR_REQUEST_LEAVE: "hr:request_leave"',
    'HR_APPROVE_LEAVE_REQUEST: "hr:approve_leave_request"',
    "PERMISSION_KEY_COUNT = 112",
  ]) {
    assert.ok(permissions.includes(expected), `expected ${expected}`);
  }

  const catalog = seed.match(
    /INSERT INTO public\.permission_keys[\s\S]*?VALUES([\s\S]*?)ON CONFLICT \(key\) DO NOTHING;/,
  );
  const catalogValues = catalog?.[1];
  assert.ok(catalogValues, "permission seed catalog must exist");
  const seededKeys = [...catalogValues.matchAll(/\('([^']+)' *,/g)].map(
    (match) => match[1],
  );
  assert.equal(seededKeys.length, 112);
  assert.equal(new Set(seededKeys).size, 112);

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

test("Canonical self-service exposes leave requests from /me/schedule", () => {
  const schedule = read("apps/web/lib/staff-runtime/schedule/page.tsx");
  const legacyScheduleRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/schedule/page.tsx",
  );
  const scheduleRoute = read("apps/web/app/(protected)/me/schedule/page.tsx");
  const scheduleActions = read(
    "apps/web/lib/staff-runtime/schedule/actions.ts",
  );
  const scheduleData = read("apps/web/lib/staff-runtime/schedule/data.ts");
  const page = read("apps/web/lib/staff-runtime/leave/page.tsx");
  const client = read("apps/web/lib/staff-runtime/leave/leave-client.tsx");
  const form = read("apps/web/lib/staff-runtime/leave/leave-request-form.tsx");
  const actions = read("apps/web/lib/staff-runtime/leave/actions.ts");
  const messages = read("apps/web/lib/messages/employee.ts");

  assert.ok(
    schedule.includes("loadScheduleMonth(ctx, monthStart)"),
    "expected initial schedule RSC to reuse its authenticated context",
  );
  for (const expected of ["getEmployeeContext", "loadScheduleMonth(ctx"]) {
    assert.ok(
      scheduleActions.includes(expected),
      `expected schedule action ${expected}`,
    );
  }
  assert.match(scheduleRoute, /leaveHref="\/me\/schedule\/leave"/);
  assert.match(
    legacyScheduleRoute,
    /leaveHref=\{`\/br\/\$\{branchId\}\/shift\/schedule\/leave`\}/,
  );

  for (const expected of [
    '.from("leave_requests")',
    '.eq("employee_id", employeeId)',
    '.eq("tenant_id", claims.tenant_id)',
  ]) {
    assert.ok(
      scheduleData.includes(expected),
      `expected schedule data ${expected}`,
    );
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
    "LEAVE_TYPE_LABELS_VI",
    'status === "pending"',
    "FormSheet",
    "DayLeaveRequestForm",
  ]) {
    assert.ok(client.includes(expected) || form.includes(expected), `expected client ${expected}`);
  }
  assert.ok(form.includes("TextareaField"), "expected leave form TextareaField");

  for (const expected of [
    "getEmployeeContext",
    'ctx.claims.user_role === "owner"',
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

test("HR attendance route exposes branch-scoped leave approvals", () => {
  const attendancePage = read(
    "apps/web/app/(protected)/hr/attendance/page.tsx",
  );
  const table = read("apps/web/app/(protected)/hr/leave-requests-table.tsx");
  const actions = read("apps/web/app/(protected)/hr/leave-request-actions.ts");
  const messages = read("apps/web/lib/messages/hr.ts");

  for (const expected of ["LeaveRequestsTable", "copy.tabs.attendance"]) {
    assert.ok(
      attendancePage.includes(expected),
      `expected HR attendance route ${expected}`,
    );
  }
  assert.ok(
    !attendancePage.includes("LeaveRequestClient"),
    "owner attendance must review requests, not render the employee self-service form",
  );

  for (const expected of [
    "fetchLeaveRequests",
    "approveLeaveRequest",
    "rejectLeaveRequest",
    "branchId: request.branch_id",
    "branchId: rejectTarget.branch_id",
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
