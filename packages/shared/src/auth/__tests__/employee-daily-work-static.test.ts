import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Employee Daily Work migration hardens attendance and adds checklist RPCs", () => {
  const migration = read(
    "supabase/migrations/20260609093000_employee_daily_work.sql",
  );

  for (const expected of [
    "check_in_photo_path text",
    "check_out_code_verified boolean NOT NULL DEFAULT false",
    "'attendance-photos'",
    "shift_checklist_templates",
    "shift_checklist_template_items",
    "attendance_checklist_items",
    "CREATE OR REPLACE FUNCTION public.employee_clock_in_with_checklist",
    "CREATE OR REPLACE FUNCTION public.employee_clock_out_with_code",
    "CREATE OR REPLACE FUNCTION public.upsert_shift_checklist_template",
    "p_shift_id IS NOT NULL AND p_shift_id <> 0",
    "RAISE EXCEPTION 'shift_not_found'",
    "RAISE EXCEPTION 'checklist_incomplete'",
    "GRANT EXECUTE ON FUNCTION public.employee_clock_in_with_checklist",
    "TO service_role",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  assert.match(
    migration,
    /REVOKE INSERT,\s*UPDATE,\s*DELETE[\s\S]*ON TABLE public\.attendance_records[\s\S]*FROM anon,\s*authenticated;/,
    "expected direct attendance INSERT/UPDATE/DELETE to be revoked from anon/authenticated",
  );
  assert.ok(
    migration.includes("DROP POLICY IF EXISTS attendance_self_checkin") &&
      migration.includes("DROP POLICY IF EXISTS attendance_self_checkout") &&
      migration.includes("DROP POLICY IF EXISTS attendance_write"),
    "expected old self-write attendance policies to be dropped",
  );
  assert.ok(
    !/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.employee_clock_(in|out)[\s\S]*TO\s+authenticated/i.test(
      migration,
    ),
    "Employee clock RPCs must not be executable directly by authenticated clients",
  );
});

test("Employee clock client and actions no longer use GPS for clock-in/out", () => {
  const actionSrc = read("apps/web/app/(protected)/employee/clock/actions.ts");
  const clientSrc = read(
    "apps/web/app/(protected)/employee/clock/clock-client.tsx",
  );

  assert.ok(
    actionSrc.includes("clockInWithPhoto") &&
      actionSrc.includes("toggleChecklistItem") &&
      actionSrc.includes("requestCheckoutApproval"),
    "expected new Employee Daily Work server actions",
  );
  assert.ok(
    actionSrc.includes("employee_clock_in_with_checklist") &&
      actionSrc.includes("employee_request_clock_out") &&
      actionSrc.includes(".remove([photoPath])"),
    "expected clock-in/out to use RPCs and clean up uploaded photo on RPC failure",
  );
  assert.ok(
    actionSrc.includes("alreadyRecorded") &&
      actionSrc.includes("getExistingClockInPath") &&
      clientSrc.includes("result.data?.nextPath"),
    "duplicate clock-in should recover into the current Employee state instead of surfacing a red error",
  );

  for (const forbidden of [
    "navigator.geolocation",
    "MAX_DISTANCE_METERS",
    "haversineMeters",
    "latitude",
    "longitude",
    "clockOutWithCode",
    "employee_request_clock_out_with_code",
    "checkoutCodeSchema",
    "Html5Qrcode",
    "html5-qrcode",
    "Quét mã QR",
    "Nhập mã",
  ]) {
    assert.ok(
      !clientSrc.includes(forbidden),
      `client must not contain ${forbidden}`,
    );
    assert.ok(
      !actionSrc.includes(forbidden),
      `action must not contain ${forbidden}`,
    );
  }
});

test("Employee checkout approval keeps checkout pending until Branch Manager approves", () => {
  const migration = read(
    "supabase/migrations/20260609100000_employee_checkout_approval.sql",
  );
  const grantMigration = read(
    "supabase/migrations/20260609132012_grant_private_schema_usage_to_service_role.sql",
  );
  const actionSrc = read("apps/web/app/(protected)/employee/clock/actions.ts");
  const workStateSrc = read(
    "apps/web/app/(protected)/employee/_lib/today-work-state.ts",
  );
  const approvalsPageSrc = read(
    "apps/web/app/(protected)/employee/checkout-approvals/page.tsx",
  );

  for (const expected of [
    "checkout_requested_at timestamptz",
    "checkout_requested_by_role text",
    "checkout_approval_target_roles text[] NOT NULL DEFAULT ARRAY['branch_manager']::text[]",
    "checkout_approved_at timestamptz",
    "checkout_approved_by uuid REFERENCES auth.users(id)",
    "CREATE OR REPLACE FUNCTION public.employee_request_clock_out",
    "CREATE OR REPLACE FUNCTION public.branch_manager_approve_employee_clock_out",
    "check_out = v_requested_at",
    "'attendance.checkout_requested'",
    "ARRAY['owner', 'super_manager']::text[]",
    "cannot_approve_own_checkout",
    "branch_manager_can_only_approve_branch_staff",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  assert.ok(
    !migration.includes("checkout_requested_code_verified"),
    "checkout request must not store or preserve branch code verification",
  );
  assert.ok(
    grantMigration.includes("GRANT USAGE ON SCHEMA private TO service_role") &&
      grantMigration.includes(
        "GRANT EXECUTE ON FUNCTION private.staff_role_from_position_code(text)",
      ) &&
      grantMigration.includes("FROM PUBLIC, anon, authenticated"),
    "service-role checkout RPCs must be able to enter private schema helpers without exposing them to browser-callable roles",
  );

  assert.ok(
    actionSrc.includes("probePermission") &&
      actionSrc.includes("PERMISSION_KEYS.HR_APPROVE_SHIFT_REQUEST") &&
      actionSrc.includes('"owner"') &&
      actionSrc.includes('"super_manager"') &&
      actionSrc.includes("employee_request_clock_out") &&
      actionSrc.includes("branch_manager_approve_employee_clock_out"),
    "expected approval action to check branch-scoped permission before service-role approval",
  );
  assert.ok(
    workStateSrc.includes('"checkout_pending"') &&
      workStateSrc.includes('"not_required"') &&
      workStateSrc.includes("DEFAULT_ATTENDANCE_ROLES") &&
      workStateSrc.includes("attendance.checkoutRequestedAt") &&
      workStateSrc.includes("approvalTargetLabel"),
    "expected work state to expose checkout pending and non-required attendance status",
  );
  assert.ok(
    approvalsPageSrc.includes("CHECKOUT_APPROVER_ROLES") &&
      approvalsPageSrc.includes("checkout_approval_target_roles") &&
      approvalsPageSrc.includes("has_permission_any") &&
      approvalsPageSrc.includes("has_permission") &&
      approvalsPageSrc.includes("HR_APPROVE_SHIFT_REQUEST"),
    "expected approval page to be manager-tier and permission scoped",
  );
});
