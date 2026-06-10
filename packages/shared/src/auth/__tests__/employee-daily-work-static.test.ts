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
      actionSrc.includes("requestCheckoutApproval") &&
      actionSrc.includes("clockOutManagerShift"),
    "expected new Employee Daily Work server actions",
  );
  assert.ok(
      actionSrc.includes("employee_clock_in_with_checklist") &&
      actionSrc.includes("employee_request_clock_out") &&
      actionSrc.includes("!isManagerSimpleAttendanceRole(ctx.claims.user_role)") &&
      actionSrc.includes("checkout_requested_at: null") &&
      actionSrc.includes(".remove([photoPath])"),
    "expected floor-staff clock-in/out to use RPCs, manager self-checkout to stay direct and scoped, and failed photo rows to clean up",
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

test("Employee checklist templates are managed as HR templates, not roles", () => {
  const migration = read(
    "supabase/migrations/20260610170000_hr_checklist_template_library.sql",
  );
  const actionSrc = read("apps/web/app/(protected)/employee/clock/actions.ts");
  const checklistActionSrc = read(
    "apps/web/app/(protected)/hr/checklist-actions.ts",
  );
  const hrClientSrc = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const employeeTableSrc = read(
    "apps/web/app/(protected)/hr/employee-table.tsx",
  );
  const assignmentTableSrc = read(
    "apps/web/app/(protected)/hr/shift-assignments-table.tsx",
  );
  const branchSettingsPageSrc = read(
    "apps/web/app/(protected)/br/[branchId]/settings/page.tsx",
  );
  const branchSettingsCardSrc = read(
    "apps/web/app/(protected)/br/[branchId]/settings/attendance-settings-card.tsx",
  );

  for (const expected of [
    "ALTER COLUMN branch_id DROP NOT NULL",
    "Legacy compatibility only. Checklist selection no longer uses role_code.",
    "default_checklist_template_id bigint",
    "checklist_template_id bigint",
    "phase text NOT NULL DEFAULT 'trong_ca'",
    "done_definition text NOT NULL DEFAULT ''",
    "is_required boolean NOT NULL DEFAULT true",
    "v_template_id := COALESCE(v_assignment_template_id, v_employee_template_id)",
    "p_items jsonb",
    "AND i.is_required = true",
    "p_checklist_template_id bigint DEFAULT NULL",
    "v_source.checklist_template_id",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  for (const templateName of [
    "Quầy",
    "Phục vụ",
    "Nướng",
    "Phụ bếp",
    "Tạp vụ",
  ]) {
    assert.ok(
      migration.includes(`'${templateName}'`),
      `expected seed template ${templateName}`,
    );
  }

  assert.ok(
    !actionSrc.includes("p_role_code") &&
      !migration.includes("t.role_code = v_role_code"),
    "checklist selection must not depend on system role_code",
  );
  assert.ok(
    checklistActionSrc.includes("saveChecklistTemplate") &&
      checklistActionSrc.includes("setEmployeeDefaultChecklist") &&
      checklistActionSrc.includes('"upsert_shift_checklist_template"') &&
      checklistActionSrc.includes("doneDefinition") &&
      checklistActionSrc.includes("isRequired"),
    "HR checklist actions must save templates through the JSON RPC and set employee defaults",
  );
  assert.ok(
    hrClientSrc.includes('<TabsTrigger value="checklist">') &&
      hrClientSrc.includes("ChecklistTemplatesTable") &&
      employeeTableSrc.includes("Checklist mặc định") &&
      assignmentTableSrc.includes("Checklist override"),
    "HR UI must expose template library, employee defaults, and shift overrides",
  );
  assert.ok(
    branchSettingsPageSrc.includes("AttendanceSettingsCard") &&
      branchSettingsCardSrc.includes('href="/hr"') &&
      !branchSettingsPageSrc.includes("role_code") &&
      !branchSettingsCardSrc.includes("AttendanceConfigDialog"),
    "branch settings hub must route checklist configuration to HR instead of the old role editor",
  );
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
      workStateSrc.includes("managerAttendanceOnly") &&
      workStateSrc.includes("isManagerSimpleAttendanceRole") &&
      workStateSrc.includes("DEFAULT_ATTENDANCE_ROLES") &&
      workStateSrc.includes("requiredRemaining") &&
      workStateSrc.includes("isRequired") &&
      workStateSrc.includes("attendance.checkoutRequestedAt") &&
      workStateSrc.includes("approvalTargetLabel"),
    "expected work state to expose floor-staff checkout pending, required-only checklist progress, plus branch-manager attendance-only status",
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
