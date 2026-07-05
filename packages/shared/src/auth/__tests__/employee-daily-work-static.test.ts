import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Employee Daily Work migration hardens attendance and adds checklist RPCs", () => {
  const migration = read(
    "supabase/migrations/_archive/20260609093000_employee_daily_work.sql",
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
  const actionSrc = read("apps/web/lib/employee/clock/actions.ts");
  const clientSrc = read(
    "apps/web/lib/employee/clock/clock-client.tsx",
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
      actionSrc.includes(
        "!isManagerSimpleAttendanceRole(ctx.claims.user_role)",
      ) &&
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
    "supabase/migrations/_archive/20260610170000_hr_checklist_template_library.sql",
  );
  const actionSrc = read("apps/web/lib/employee/clock/actions.ts");
  const positionTasksActionSrc = read(
    "apps/web/app/(protected)/hr/position-tasks-actions.ts",
  );
  const hrClientSrc = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const branchSettingsPageSrc = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
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
    positionTasksActionSrc.includes("savePositionTasks") &&
      positionTasksActionSrc.includes('"upsert_position_shift_tasks"') &&
      positionTasksActionSrc.includes("doneDefinition") &&
      positionTasksActionSrc.includes("isRequired"),
    "HR position-task actions must save tasks through the JSON RPC",
  );
  assert.ok(
    /value:\s*"setup",\s*label:\s*copy\.tabs\.setup/.test(hrClientSrc) &&
      hrClientSrc.includes('<TabsContent value="setup"') &&
      hrClientSrc.includes("PositionTasksClient"),
    "HR UI must expose the per-position task editor",
  );
  assert.ok(
    !branchSettingsPageSrc.includes("AttendanceSettingsCard") &&
      !branchSettingsPageSrc.includes('href="/hr"') &&
      !branchSettingsPageSrc.includes("role_code"),
    "branch settings hub must stay branch-setup only; checklist configuration belongs to HR workspace, not a branch setup shortcut",
  );
});

test("HRM consumption checklist is optional for each canonical template", () => {
  const migration = read(
    "supabase/migrations/_archive/20260618060957_hrm_checkout_consumption_checklist.sql",
  );

  for (const expected of [
    "Tiêu hao bếp trong ngày",
    "'end_of_shift'",
    "'closing'",
    "is_required = false",
    "AND is_active = true",
    "Nếu được giao",
    "doanh thu ròng",
    "tiêu hao trong ngày",
    "'Kiểm kê Inventory'",
    "'Kiểm kê trước khi chấm công ra'",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  for (const templateName of [
    "Phục vụ",
    "Phụ bếp",
    "Quầy",
    "Nướng",
    "Tạp vụ",
    "Cửa hàng trưởng",
    "Bếp trưởng",
  ]) {
    assert.ok(
      migration.includes(`'${templateName}'`),
      `expected checkout consumption row for ${templateName}`,
    );
  }

  assert.ok(
    migration.includes("WHERE i.tenant_id = v_tenant") &&
      migration.includes("AND i.template_id = v_template_id") &&
      migration.includes(
        "AND i.title IN (\n            v_item.title,\n            'Kiểm kê Inventory',\n            'Kiểm kê trước khi chấm công ra'\n          )",
      ),
    "migration must be idempotent per tenant/template/title",
  );
});

test("HRM consumption history stays available but no longer gates Employee checkout", () => {
  const migration = read(
    "supabase/migrations/_archive/20260618070000_hrm_consumption_report_approval.sql",
  );
  const taskKindMigration = read(
    "supabase/migrations/_archive/20260619042223_employee_consumption_task_kind.sql",
  );
  const actionsSrc = read(
    "apps/web/lib/employee/consumption-actions.ts",
  );
  const clockActionsSrc = read(
    "apps/web/lib/employee/clock/actions.ts",
  );
  const tasksClientSrc = read(
    "apps/web/lib/employee/tasks/tasks-client.tsx",
  );
  const approvalsClientSrc = read(
    "apps/web/lib/employee/checkout-approvals/checkout-approvals-client.tsx",
  );
  const issueActionsSrc = read(
    "apps/web/app/(protected)/inventory/issue-actions.ts",
  );
  const issueDetailSrc = read(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  const documentCorrectionSrc = read(
    "apps/web/app/(protected)/inventory/document-correction-actions.ts",
  );
  const hrClientSrc = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const positionTasksActionsSrc = read(
    "apps/web/app/(protected)/hr/position-tasks-actions.ts",
  );
  const positionTasksClientSrc = read(
    "apps/web/app/(protected)/hr/position-tasks-client.tsx",
  );

  for (const expected of [
    "CREATE TABLE IF NOT EXISTS public.attendance_consumption_reports",
    "no_consumption boolean NOT NULL DEFAULT false",
    "CREATE TABLE IF NOT EXISTS public.shift_checklist_consumption_default_items",
    "CREATE TABLE IF NOT EXISTS public.attendance_consumption_report_lines",
    "default_item_id bigint",
    "CREATE OR REPLACE FUNCTION public.employee_submit_consumption_report",
    "CREATE OR REPLACE FUNCTION public.branch_manager_request_consumption_adjustment",
    "CREATE OR REPLACE FUNCTION public.branch_manager_approve_consumption_report",
    "p_no_consumption boolean DEFAULT false",
    "consumption_checklist_not_assigned",
    "no_consumption = EXCLUDED.no_consumption",
    "status = 'needs_changes'",
    "checkout_requested_at = NULL",
    "INSERT INTO public.stock_issues",
    "INSERT INTO public.stock_issue_items",
    "INSERT INTO public.stock_movements",
    "i.purchase_unit",
    "'sale_consumption'",
    "'attendance_consumption_report'",
    "'HRM - Tiêu hao bếp trong ngày'",
    "'hrm_consumption'",
    "GRANT EXECUTE ON FUNCTION public.employee_submit_consumption_report",
    "GRANT EXECUTE ON FUNCTION public.branch_manager_approve_consumption_report",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }

  for (const expected of [
    "ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'standard'",
    "CHECK (task_kind IN ('standard', 'consumption_report'))",
    "CREATE OR REPLACE FUNCTION public.upsert_shift_checklist_template",
    "i.task_kind",
    "ci.task_kind = 'consumption_report'",
    "AND task_kind = 'consumption_report'",
  ]) {
    assert.ok(taskKindMigration.includes(expected), `expected ${expected}`);
  }
  assert.ok(
    !taskKindMigration.includes("ci.title = 'Tiêu hao bếp trong ngày'"),
    "replacement consumption RPCs must not use the display title as the workflow key",
  );

  const submitFunction = migration.slice(
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.employee_submit_consumption_report",
    ),
    migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.branch_manager_request_consumption_adjustment",
    ),
  );
  assert.ok(
    !submitFunction.includes("INSERT INTO public.stock_issues") &&
      !submitFunction.includes("INSERT INTO public.stock_movements"),
    "employee submit RPC must not apply Inventory",
  );

  assert.ok(
    actionsSrc.includes("employee_submit_consumption_report") &&
      actionsSrc.includes("branch_manager_approve_consumption_report") &&
      actionsSrc.includes("branch_manager_request_consumption_adjustment") &&
      actionsSrc.includes("p_no_consumption") &&
      actionsSrc.includes("default_item_id") &&
      actionsSrc.includes("defaultSortOrder") &&
      actionsSrc.includes("mapReviewError") &&
      actionsSrc.includes("insufficient_stock") &&
      actionsSrc.includes("wac_not_ready"),
    "server actions must route report submit/review through safe RPC wrappers",
  );
  assert.ok(
    !clockActionsSrc.includes("attendance_consumption_reports") &&
      !clockActionsSrc.includes('eq("task_kind", "consumption_report")') &&
      !clockActionsSrc.includes('status !== "approved"') &&
      !clockActionsSrc.includes('status !== "applied"'),
    "checkout approval action must not gate checkout approval on consumption reports",
  );
  assert.ok(
    !tasksClientSrc.includes("submitConsumptionReport") &&
      !tasksClientSrc.includes("Báo cáo tiêu hao bếp") &&
      !tasksClientSrc.includes("Không phát sinh") &&
      !tasksClientSrc.includes("defaultIngredientsToDraft") &&
      tasksClientSrc.includes('item.taskKind === "inventory_count"'),
    "Employee tasks UI must remove the consumption report panel and keep inventory count as the special workflow",
  );
  assert.ok(
    !approvalsClientSrc.includes("approveConsumptionReport") &&
      !approvalsClientSrc.includes("requestConsumptionAdjustment") &&
      !approvalsClientSrc.includes("Duyệt & áp Inventory") &&
      !approvalsClientSrc.includes("requiresConsumptionReport") &&
      !approvalsClientSrc.includes("blocksCheckout"),
    "checkout approval UI must not review consumption before checkout approval",
  );
  assert.ok(
    issueActionsSrc.includes("source_type, source_ref") &&
      issueDetailSrc.includes("getIssueSourceLabel") &&
      // Copy moved to the message catalog (i18n sweep) — the source label is
      // resolved via the hrmConsumptionSource key.
      issueDetailSrc.includes("hrmConsumptionSource") &&
      documentCorrectionSrc.includes("readHrmConsumptionTrace") &&
      documentCorrectionSrc.includes("issue.source_ref"),
    "Inventory issue detail and correction flow must preserve HRM consumption trace",
  );
  assert.ok(
    positionTasksActionsSrc.includes(
      "shift_checklist_consumption_default_items",
    ) &&
      positionTasksActionsSrc.includes("position_task_id") &&
      hrClientSrc.includes("PositionTasksClient") &&
      positionTasksClientSrc.includes("IngredientPicker"),
    "HR setup must expose default ingredients for consumption position tasks",
  );
});

test("Employee checkout approval keeps checkout pending until Branch Manager approves", () => {
  const migration = read(
    "supabase/migrations/_archive/20260609100000_employee_checkout_approval.sql",
  );
  const grantMigration = read(
    "supabase/migrations/_archive/20260609132012_grant_private_schema_usage_to_service_role.sql",
  );
  const actionSrc = read("apps/web/lib/employee/clock/actions.ts");
  const workStateSrc = read(
    "apps/web/lib/employee/_lib/today-work-state.ts",
  );
  const baselineSrc = read("supabase/migrations/00000000000000_baseline.sql");
  const countGateMigrationSrc = read(
    "supabase/migrations/_archive/20260629183853_require_inventory_count_checkout_gate.sql",
  );
  const approvalsPageSrc = read(
    "apps/web/lib/employee/checkout-approvals/page.tsx",
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
    "cannot_approve_own_checkout",
    "branch_manager_can_only_approve_branch_staff",
  ]) {
    assert.ok(migration.includes(expected), `expected ${expected}`);
  }
  assert.ok(
    countGateMigrationSrc.includes(
      "WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner']::text[]",
    ) &&
      countGateMigrationSrc.includes(
        "WHEN v_requester_role IN ('cashier', 'chef') THEN ARRAY['branch_manager']::text[]",
      ) &&
      !countGateMigrationSrc.includes(["super", "manager"].join("_")) &&
      !countGateMigrationSrc.includes(`'${["wait", "er"].join("")}'`),
    "current checkout approval gate must use canonical access buckets only",
  );

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
      actionSrc.includes("PERMISSION_KEYS.HR_APPROVE_CHECKOUT") &&
      actionSrc.includes('"owner"') &&
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
  for (const src of [baselineSrc, countGateMigrationSrc]) {
    assert.ok(
      src.includes("AND i.task_kind <> 'inventory_count'") &&
        src.includes("inventory_count_slips") &&
        src.includes("s.status IN ('submitted', 'approved')"),
      "employee_request_clock_out must gate inventory_count from count slips, not the checklist checkbox",
    );
  }
  assert.ok(
    approvalsPageSrc.includes("CHECKOUT_APPROVER_ROLES") &&
      approvalsPageSrc.includes("checkout_approval_target_roles") &&
      approvalsPageSrc.includes("has_permission_any") &&
      approvalsPageSrc.includes("has_permission") &&
      approvalsPageSrc.includes("HR_APPROVE_CHECKOUT"),
    "expected approval page to be manager-tier and permission scoped",
  );
});
