import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// HRM day-work contract from decisions D026/D027:
// 1) Leave grants are backfilled (the template-only seed of 20260610110000
//    left prod with 0 users able to request/approve leave).
// 2) Approvers receive a notification on every new leave request.
// 3) Shift registration is removed entirely (the shop runs default shifts;
//    the approval end was never rendered). hr:approve_shift_request is KEPT
//    because it gates checkout approval.

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const MIGRATION_PATH =
  "supabase/migration-archive/20260610234500_hrm_leave_grants_drop_shift_requests.sql";

test("Migration backfills leave grants and notifies approvers", () => {
  const migration = read(MIGRATION_PATH);
  const baseline = read("supabase/migrations/20260717151345_baseline.sql");

  for (const expected of [
    "SELECT public.sync_missing_permissions_from_template();",
    "CREATE OR REPLACE FUNCTION public.submit_leave_request",
    "INSERT INTO public.notifications",
    "'hr.leave_requested'",
    "format('hr.leave_request:%s', v_request_id)",
    "REVOKE ALL ON FUNCTION public.submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT) FROM PUBLIC, anon",
    "GRANT EXECUTE ON FUNCTION public.submit_leave_request(BIGINT, DATE, DATE, TEXT, TEXT) TO authenticated, service_role",
    "pg_advisory_xact_lock(v_employee_id)",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }
  assert.ok(
    baseline.includes("v_target_roles := ARRAY[ 'owner'];") &&
      baseline.includes("v_target_roles := ARRAY['branch_manager', 'owner'];") &&
      !baseline.includes(
        `ARRAY['branch_manager', '${["super", "manager"].join("_")}', 'owner']`,
      ) &&
      !baseline.includes(`ARRAY['${["super", "manager"].join("_")}', 'owner']`),
    "current submit_leave_request target roles must use canonical owner/branch_manager buckets",
  );
});

test("Migration drops the shift-registration flow but keeps the checkout-approval key", () => {
  const migration = read(MIGRATION_PATH);

  for (const expected of [
    "DROP FUNCTION IF EXISTS public.submit_shift_request(bigint, bigint, date, text);",
    "DROP FUNCTION IF EXISTS public.cancel_shift_request(bigint);",
    "DROP FUNCTION IF EXISTS public.approve_shift_request(bigint);",
    "DROP FUNCTION IF EXISTS public.reject_shift_request(bigint, text);",
    "DROP TABLE IF EXISTS public.shift_requests;",
    "DROP TYPE IF EXISTS public.shift_request_status;",
    "WHERE permission_key = 'hr:register_shift';",
    "array_remove(permission_keys, 'hr:register_shift')",
    "WHERE key = 'hr:register_shift';",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  // hr:approve_shift_request may only change description — never deleted/revoked.
  assert.ok(
    migration.includes(
      "UPDATE public.permission_keys\nSET description = 'Duyệt kết ca nhân viên theo chi nhánh'\nWHERE key = 'hr:approve_shift_request';",
    ),
    "expected approve_shift_request description update",
  );
  assert.ok(
    !migration.includes("permission_key = 'hr:approve_shift_request'"),
    "must not delete grants of hr:approve_shift_request (gates checkout approval)",
  );
});

test("Shared permission catalog drops register_shift but keeps checkout-approval and leave keys", () => {
  const permissions = read("packages/shared/src/auth/permissions.ts");

  assert.ok(
    !permissions.includes("hr:register_shift"),
    "hr:register_shift must be removed from the permission catalog",
  );
  for (const expected of [
    'HR_APPROVE_CHECKOUT: "hr:approve_checkout"',
    'HR_REQUEST_LEAVE: "hr:request_leave"',
    'HR_APPROVE_LEAVE_REQUEST: "hr:approve_leave_request"',
  ]) {
    assert.ok(permissions.includes(expected), `expected ${expected}`);
  }
});

test("Shift-registration surfaces are deleted and no app code links to them", () => {
  for (const gone of [
    "apps/web/lib/staff-runtime/shift-register",
    "apps/web/app/(protected)/hr/shift-request-actions.ts",
    "apps/web/app/(protected)/hr/shift-requests-table.tsx",
  ]) {
    assert.ok(
      !existsSync(resolve(repoRoot, gone)),
      `${gone} must be deleted`,
    );
  }

  for (const path of [
    "apps/web/lib/staff-runtime/profile/page.tsx",
    "apps/web/lib/staff-runtime/schedule/schedule-client.tsx",
    "apps/web/lib/messages/employee.ts",
  ]) {
    assert.ok(
      !read(path).includes("shift-register"),
      `${path} must not reference shift-register`,
    );
  }
});

test("Schedule is the single day-axis: leave ranges render and link to leave request", () => {
  const actions = read(
    "apps/web/lib/staff-runtime/schedule/actions.ts",
  );
  for (const expected of [
    'from("leave_requests")',
    '.in("status", ["pending", "approved"])',
    "leaves: ScheduleLeave[]",
  ]) {
    assert.ok(actions.includes(expected), `expected ${expected}`);
  }

  const client = read(
    "apps/web/lib/staff-runtime/schedule/schedule-client.tsx",
  );
  for (const expected of [
    "expandLeavesByDate",
    "leaveByDate",
    "href={leaveHref}",
    "copy.requestLeaveCta",
  ]) {
    assert.ok(client.includes(expected), `expected ${expected}`);
  }
});

test("Checkout approval gate uses hr:approve_checkout (renamed in Phase 2)", () => {
  const clockActions = read(
    "apps/web/lib/staff-runtime/clock/actions.ts",
  );
  const approvalsPage = read(
    "apps/web/lib/staff-runtime/checkout-approvals/page.tsx",
  );

  assert.ok(
    clockActions.includes("PERMISSION_KEYS.HR_APPROVE_CHECKOUT"),
    "clock actions must keep the checkout-approval permission gate",
  );
  assert.ok(
    approvalsPage.includes("PERMISSION_KEYS.HR_APPROVE_CHECKOUT"),
    "checkout approvals page must keep the permission gate",
  );
});

// ─── Phase 2: shift assignments dropped + HR permission keys consolidated ──

const P2_MIGRATION_PATH =
  "supabase/migration-archive/20260611103000_hrm_p2_drop_shift_assignments_lean_hr_keys.sql";

test("P2 migration drops shift_assignments and the bulk scheduling RPCs", () => {
  const migration = read(P2_MIGRATION_PATH);

  for (const expected of [
    "DROP TABLE IF EXISTS public.shift_assignments;",
    "'bulk_upsert_shift_assignments'",
    "'copy_shift_assignments_week'",
    "'bulk_delete_future_shift_assignments'",
    "CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  // RPC v4 no longer reads shift assignments.
  const rpcBody = migration.slice(
    migration.indexOf("employee_clock_in_with_checklist"),
    migration.indexOf("-- ─── A2."),
  );
  assert.ok(
    !rpcBody.includes("shift_assignments"),
    "clock-in RPC v4 must not read shift_assignments",
  );
});

test("P2 migration leans HR keys: 4 dead keys removed, approve key renamed", () => {
  const migration = read(P2_MIGRATION_PATH);

  for (const expected of [
    "DROP POLICY IF EXISTS contracts_write ON public.employment_contracts;",
    "'hr:contract_create', 'hr:contract_sign', 'hr:terminate', 'hr:dependent_manage'",
    "VALUES ('hr:approve_checkout', 'hr', 'Duyệt kết ca nhân viên theo chi nhánh', 'branch')",
    "SET permission_key = 'hr:approve_checkout'",
    "array_replace(\n      permission_keys, 'hr:approve_shift_request', 'hr:approve_checkout')",
    "WHERE key = 'hr:approve_shift_request';",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  const permissions = read("packages/shared/src/auth/permissions.ts");
  for (const gone of [
    "hr:contract_create",
    "hr:contract_sign",
    "hr:terminate",
    "hr:dependent_manage",
    "hr:approve_shift_request",
  ]) {
    assert.ok(
      !permissions.includes(gone),
      `${gone} must be removed from the permission catalog`,
    );
  }
});

test("P2 app no longer references shift assignments anywhere", () => {
  for (const gone of [
    "apps/web/app/(protected)/hr/shift-assignments-table.tsx",
    "apps/web/app/(protected)/hr/shift-assignment-actions.ts",
  ]) {
    assert.ok(
      !existsSync(resolve(repoRoot, gone)),
      `${gone} must be deleted`,
    );
  }

  for (const path of [
    "apps/web/app/(protected)/hr/hr-client.tsx",
    "apps/web/app/(protected)/hr/actions.ts",
    "apps/web/lib/staff-runtime/clock/actions.ts",
    "apps/web/lib/staff-runtime/_lib/today-work-state.ts",
    "apps/web/lib/staff-runtime/schedule/actions.ts",
    "apps/web/lib/staff-runtime/schedule/page.tsx",
  ]) {
    assert.ok(
      !read(path).includes("shift_assignments"),
      `${path} must not reference shift_assignments`,
    );
  }

  const hrClient = read("apps/web/app/(protected)/hr/hr-client.tsx");
  assert.ok(
    !hrClient.includes('value="assignments"'),
    "Phân ca tab must be removed from the HR workspace",
  );
});

test("P2 HR attendance tab shows approved leave for the month", () => {
  const actions = read("apps/web/app/(protected)/hr/leave-request-actions.ts");
  for (const expected of [
    "fetchApprovedLeaveMonth",
    '.eq("status", "approved")',
    "PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST",
  ]) {
    assert.ok(actions.includes(expected), `expected ${expected}`);
  }

  const table = read("apps/web/app/(protected)/hr/attendance-table.tsx");
  for (const expected of [
    "fetchApprovedLeaveMonth",
    "ApprovedLeavePanel",
    "attendanceCopy.leaveTitle",
  ]) {
    assert.ok(table.includes(expected), `expected ${expected}`);
  }
});
