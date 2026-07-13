import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const baseline = read("supabase/migrations/00000000000000_baseline.sql");

function pgDumpBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing pg_dump block: ${marker}`);
  const next = source.indexOf("\n\n--\n-- Name:", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

test("Employee Daily Work baseline hardens attendance and checklist RPCs", () => {
  const attendancePhotoDataHistory = read(
    "supabase/migration-archive/20260609093000_employee_daily_work.sql",
  );
  const attendanceRecordsTable = pgDumpBlock(
    baseline,
    "-- Name: attendance_records; Type: TABLE;",
  );
  const attendanceTableAcl = pgDumpBlock(
    baseline,
    "-- Name: TABLE attendance_records; Type: ACL;",
  );
  const clockInFunction = pgDumpBlock(
    baseline,
    "-- Name: employee_clock_in_with_checklist(bigint, bigint, bigint, bigint, date, text); Type: FUNCTION;",
  );
  const clockOutCompatibilityFunction = pgDumpBlock(
    baseline,
    "-- Name: employee_clock_out_with_code(bigint, bigint, bigint); Type: FUNCTION;",
  );
  const clockInAcl = pgDumpBlock(
    baseline,
    "-- Name: FUNCTION employee_clock_in_with_checklist(p_tenant_id bigint, p_employee_id bigint, p_branch_id bigint, p_shift_id bigint, p_business_date date, p_photo_path text); Type: ACL;",
  );

  assert.match(attendanceRecordsTable, /check_in_photo_path text/);
  assert.match(
    attendanceRecordsTable,
    /check_out_code_verified boolean DEFAULT false NOT NULL/,
  );
  assert.match(
    attendancePhotoDataHistory,
    /INSERT INTO storage\.buckets[\s\S]*?'attendance-photos'/,
    "the archived migration must retain the one-time private Storage bucket seed",
  );
  assert.match(clockInFunction, /CREATE FUNCTION public\.employee_clock_in_with_checklist/);
  assert.match(clockInFunction, /p_shift_id IS NULL OR p_shift_id = 0/);
  assert.match(clockInFunction, /RAISE EXCEPTION 'shift_not_found'/);
  assert.match(
    clockOutCompatibilityFunction,
    /RETURN public\.employee_request_clock_out/,
    "the legacy-named clock-out RPC must delegate to the current approval request flow",
  );
  assert.match(
    attendanceTableAcl,
    /GRANT SELECT ON TABLE public\.attendance_records TO authenticated;/,
    "authenticated clients must remain read-only on attendance rows",
  );
  assert.doesNotMatch(
    attendanceTableAcl,
    /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\.attendance_records TO (?:anon|authenticated)/,
  );
  assert.doesNotMatch(
    baseline,
    /CREATE POLICY attendance_(?:self_checkin|self_checkout|write) ON public\.attendance_records/,
    "the current baseline must not restore direct self-write attendance policies",
  );
  assert.match(clockInAcl, /REVOKE ALL[\s\S]*FROM PUBLIC;/);
  assert.match(clockInAcl, /GRANT ALL[\s\S]*TO service_role;/);
  assert.doesNotMatch(clockInAcl, / TO (?:anon|authenticated);/);
});

test("Employee clock client and actions no longer use GPS for clock-in/out", () => {
  const actionSrc = read("apps/web/lib/staff-runtime/clock/actions.ts");
  const clientSrc = read(
    "apps/web/lib/staff-runtime/clock/clock-client.tsx",
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

test("Employee checklist tasks are managed per position, not system role", () => {
  const checklistSeedHistory = read(
    "supabase/migration-archive/20260610170000_hr_checklist_template_library.sql",
  );
  const actionSrc = read("apps/web/lib/staff-runtime/clock/actions.ts");
  const positionTasksActionSrc = read(
    "apps/web/app/(protected)/hr/position-tasks-actions.ts",
  );
  const hrClientSrc = read("apps/web/app/(protected)/hr/hr-client.tsx");
  const branchSettingsPageSrc = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/page.tsx",
  );
  const positionTasksTable = pgDumpBlock(
    baseline,
    "-- Name: position_shift_tasks; Type: TABLE;",
  );
  const clockInFunction = pgDumpBlock(
    baseline,
    "-- Name: employee_clock_in_with_checklist(bigint, bigint, bigint, bigint, date, text); Type: FUNCTION;",
  );
  const upsertPositionTasksFunction = pgDumpBlock(
    baseline,
    "-- Name: upsert_position_shift_tasks(bigint, jsonb); Type: FUNCTION;",
  );

  for (const expected of [
    "position_id bigint NOT NULL",
    "kind text DEFAULT 'standard'::text NOT NULL",
    "applicability text DEFAULT 'every_shift'::text NOT NULL",
    "is_required boolean DEFAULT true NOT NULL",
    "done_definition text DEFAULT ''::text NOT NULL",
  ]) {
    assert.ok(positionTasksTable.includes(expected), `expected ${expected}`);
  }
  assert.match(clockInFunction, /SELECT p\.position_id INTO v_position_id/);
  assert.match(
    clockInFunction,
    /FROM public\.position_shift_tasks t[\s\S]*t\.position_id = v_position_id/,
  );
  assert.match(
    upsertPositionTasksFunction,
    /public\.has_permission_any\('staff:manage'\)/,
  );
  assert.match(upsertPositionTasksFunction, /p_tasks jsonb/);

  for (const templateName of [
    "Quầy",
    "Phục vụ",
    "Nướng",
    "Phụ bếp",
    "Tạp vụ",
  ]) {
    assert.ok(
      checklistSeedHistory.includes(`'${templateName}'`),
      `expected historical seed template ${templateName}`,
    );
  }
  assert.match(
    checklistSeedHistory,
    /WITH seed_templates\(template_name\) AS \([\s\S]*?INSERT INTO public\.shift_checklist_templates/,
    "the archived migration must retain the one-time checklist seed DML",
  );

  assert.ok(
    !actionSrc.includes("p_role_code") &&
      !clockInFunction.includes("role_code") &&
      !upsertPositionTasksFunction.includes("role_code"),
    "current checklist selection and writes must not depend on system role_code",
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

test("Historical HRM consumption checklist seed stays idempotent", () => {
  const dataHistory = read(
    "supabase/migration-archive/20260618060957_hrm_checkout_consumption_checklist.sql",
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
    assert.ok(dataHistory.includes(expected), `expected ${expected}`);
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
      dataHistory.includes(`'${templateName}'`),
      `expected checkout consumption row for ${templateName}`,
    );
  }

  assert.ok(
    dataHistory.includes("WHERE i.tenant_id = v_tenant") &&
      dataHistory.includes("AND i.template_id = v_template_id") &&
      dataHistory.includes(
        "AND i.title IN (\n            v_item.title,\n            'Kiểm kê Inventory',\n            'Kiểm kê trước khi chấm công ra'\n          )",
      ),
    "historical data mutation must be idempotent per tenant/template/title",
  );
});

test("HRM consumption history stays available but no longer gates Employee checkout", () => {
  const taskKindDataHistory = read(
    "supabase/migration-archive/20260619042223_employee_consumption_task_kind.sql",
  );
  const clockActionsSrc = read(
    "apps/web/lib/staff-runtime/clock/actions.ts",
  );
  const tasksClientSrc = read(
    "apps/web/lib/staff-runtime/tasks/tasks-client.tsx",
  );
  const approvalsClientSrc = read(
    "apps/web/lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
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
  const reportsTable = pgDumpBlock(
    baseline,
    "-- Name: attendance_consumption_reports; Type: TABLE;",
  );
  const reportLinesTable = pgDumpBlock(
    baseline,
    "-- Name: attendance_consumption_report_lines; Type: TABLE;",
  );
  const consumptionDefaultsTable = pgDumpBlock(
    baseline,
    "-- Name: shift_checklist_consumption_default_items; Type: TABLE;",
  );
  const attendanceChecklistTable = pgDumpBlock(
    baseline,
    "-- Name: attendance_checklist_items; Type: TABLE;",
  );
  const checklistTemplateItemsTable = pgDumpBlock(
    baseline,
    "-- Name: shift_checklist_template_items; Type: TABLE;",
  );
  const submitFunction = pgDumpBlock(
    baseline,
    "-- Name: employee_submit_consumption_report(bigint, bigint, jsonb, text, boolean); Type: FUNCTION;",
  );
  const requestAdjustmentFunction = pgDumpBlock(
    baseline,
    "-- Name: branch_manager_request_consumption_adjustment(bigint, bigint, text); Type: FUNCTION;",
  );
  const approveConsumptionFunction = pgDumpBlock(
    baseline,
    "-- Name: branch_manager_approve_consumption_report(bigint, bigint); Type: FUNCTION;",
  );
  const upsertTemplateFunction = pgDumpBlock(
    baseline,
    "-- Name: upsert_shift_checklist_template(bigint, bigint, bigint, text, jsonb); Type: FUNCTION;",
  );
  const submitAcl = pgDumpBlock(
    baseline,
    "-- Name: FUNCTION employee_submit_consumption_report(p_tenant_id bigint, p_attendance_id bigint, p_lines jsonb, p_note text, p_no_consumption boolean); Type: ACL;",
  );
  const approveAcl = pgDumpBlock(
    baseline,
    "-- Name: FUNCTION branch_manager_approve_consumption_report(p_tenant_id bigint, p_report_id bigint); Type: ACL;",
  );

  assert.match(reportsTable, /no_consumption boolean DEFAULT false NOT NULL/);
  assert.match(reportLinesTable, /default_item_id bigint/);
  assert.match(consumptionDefaultsTable, /position_task_id bigint/);
  assert.match(
    attendanceChecklistTable,
    /task_kind text DEFAULT 'standard'::text NOT NULL/,
  );
  assert.match(
    checklistTemplateItemsTable,
    /task_kind text DEFAULT 'standard'::text NOT NULL/,
  );
  assert.match(
    taskKindDataHistory,
    /UPDATE public\.attendance_checklist_items\s+SET task_kind = 'consumption_report'\s+WHERE title = 'Tiêu hao bếp trong ngày'/,
    "the archived migration must retain the one-time display-title backfill",
  );
  assert.match(upsertTemplateFunction, /v_task_kind/);
  assert.match(submitFunction, /p_no_consumption boolean DEFAULT false/);
  assert.match(submitFunction, /consumption_checklist_not_assigned/);
  assert.match(submitFunction, /no_consumption = EXCLUDED\.no_consumption/);
  assert.match(submitFunction, /ci\.task_kind = 'consumption_report'/);
  assert.match(requestAdjustmentFunction, /SET status = 'needs_changes'/);
  assert.match(requestAdjustmentFunction, /checkout_requested_at = NULL/);
  for (const expected of [
    "INSERT INTO public.stock_issues",
    "INSERT INTO public.stock_issue_items",
    "INSERT INTO public.stock_movements",
    "'sale_consumption'",
    "'attendance_consumption_report'",
    "'HRM - Tiêu hao bếp trong ngày'",
    "'hrm_consumption'",
  ]) {
    assert.ok(
      approveConsumptionFunction.includes(expected),
      `expected current consumption approval RPC to include ${expected}`,
    );
  }
  assert.match(submitAcl, /REVOKE ALL[\s\S]*FROM PUBLIC;/);
  assert.match(submitAcl, /GRANT ALL[\s\S]*TO authenticated;/);
  assert.match(approveAcl, /REVOKE ALL[\s\S]*FROM PUBLIC;/);
  assert.match(approveAcl, /GRANT ALL[\s\S]*TO authenticated;/);
  for (const functionSource of [
    submitFunction,
    requestAdjustmentFunction,
    approveConsumptionFunction,
  ]) {
    assert.doesNotMatch(
      functionSource,
      /(?:ci\.)?title = 'Tiêu hao bếp trong ngày'/,
      "current consumption RPCs must not use the display title as the workflow key",
    );
  }
  assert.ok(
    !submitFunction.includes("INSERT INTO public.stock_issues") &&
      !submitFunction.includes("INSERT INTO public.stock_movements"),
    "employee submit RPC must not apply Inventory",
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
  const actionSrc = read("apps/web/lib/staff-runtime/clock/actions.ts");
  const workStateSrc = read(
    "apps/web/lib/staff-runtime/_lib/today-work-state.ts",
  );
  const approvalsPageSrc = read(
    "apps/web/lib/staff-runtime/checkout-approvals/page.tsx",
  );
  const attendanceRecordsTable = pgDumpBlock(
    baseline,
    "-- Name: attendance_records; Type: TABLE;",
  );
  const checkoutApprovedByForeignKey = pgDumpBlock(
    baseline,
    "-- Name: attendance_records attendance_records_checkout_approved_by_fkey; Type: FK CONSTRAINT;",
  );
  const checkoutRequestBody = pgDumpBlock(
    baseline,
    "-- Name: employee_request_clock_out(bigint, bigint, bigint); Type: FUNCTION;",
  );
  const checkoutApprovalBody = pgDumpBlock(
    baseline,
    "-- Name: branch_manager_approve_employee_clock_out(bigint, bigint, bigint, uuid, text); Type: FUNCTION;",
  );
  const checkoutRequestAcl = pgDumpBlock(
    baseline,
    "-- Name: FUNCTION employee_request_clock_out(p_tenant_id bigint, p_employee_id bigint, p_attendance_id bigint); Type: ACL;",
  );
  const checkoutApprovalAcl = pgDumpBlock(
    baseline,
    "-- Name: FUNCTION branch_manager_approve_employee_clock_out(p_tenant_id bigint, p_branch_id bigint, p_attendance_id bigint, p_approved_by uuid, p_note text); Type: ACL;",
  );
  const privateSchemaAcl = pgDumpBlock(
    baseline,
    "-- Name: SCHEMA private; Type: ACL;",
  );
  const staffRoleHelperAcl = pgDumpBlock(
    baseline,
    "-- Name: FUNCTION staff_role_from_position_code(p_code text); Type: ACL; Schema: private;",
  );

  for (const expected of [
    "checkout_requested_at timestamp with time zone",
    "checkout_requested_by_role text",
    "checkout_approval_target_roles text[] DEFAULT ARRAY['branch_manager'::text] NOT NULL",
    "checkout_approved_at timestamp with time zone",
    "checkout_approved_by uuid",
  ]) {
    assert.ok(attendanceRecordsTable.includes(expected), `expected ${expected}`);
  }
  assert.match(
    checkoutApprovedByForeignKey,
    /FOREIGN KEY \(checkout_approved_by\) REFERENCES auth\.users\(id\)/,
  );
  assert.match(
    checkoutRequestBody,
    /CREATE FUNCTION public\.employee_request_clock_out/,
  );
  assert.match(
    checkoutApprovalBody,
    /CREATE FUNCTION public\.branch_manager_approve_employee_clock_out/,
  );
  assert.match(checkoutApprovalBody, /check_out = v_requested_at/);
  assert.match(checkoutRequestBody, /'attendance\.checkout_requested'/);
  assert.match(checkoutApprovalBody, /cannot_approve_own_checkout/);
  assert.match(
    checkoutApprovalBody,
    /branch_manager_can_only_approve_branch_staff/,
  );
  assert.ok(
    checkoutRequestBody.includes(
      "WHEN v_requester_role = 'branch_manager' THEN ARRAY['owner']::text[]",
    ) &&
      checkoutRequestBody.includes(
        "WHEN v_requester_role IN ('cashier', 'chef', 'branch_staff') THEN ARRAY['branch_manager']::text[]",
      ) &&
      !checkoutRequestBody.includes(["super", "manager"].join("_")) &&
      !checkoutRequestBody.includes(`'${["wait", "er"].join("")}'`),
    "current checkout approval gate must use canonical access buckets only",
  );

  assert.ok(
    !attendanceRecordsTable.includes("checkout_requested_code_verified") &&
      !checkoutRequestBody.includes("checkout_requested_code_verified"),
    "checkout request must not store or preserve branch code verification",
  );
  assert.match(
    privateSchemaAcl,
    /GRANT USAGE ON SCHEMA private TO service_role/,
  );
  assert.match(
    staffRoleHelperAcl,
    /REVOKE ALL ON FUNCTION private\.staff_role_from_position_code\(p_code text\) FROM PUBLIC;/,
  );
  assert.match(
    staffRoleHelperAcl,
    /GRANT ALL ON FUNCTION private\.staff_role_from_position_code\(p_code text\) TO service_role;/,
  );
  assert.doesNotMatch(
    staffRoleHelperAcl,
    / TO (?:anon|authenticated);/,
    "service-role checkout RPCs must be able to enter private schema helpers without exposing them to browser-callable roles",
  );
  for (const acl of [checkoutRequestAcl, checkoutApprovalAcl]) {
    assert.match(acl, /REVOKE ALL[\s\S]*FROM PUBLIC;/);
    assert.match(acl, /GRANT ALL[\s\S]*TO service_role;/);
    assert.doesNotMatch(acl, / TO (?:anon|authenticated);/);
  }

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
  assert.ok(
    workStateSrc.includes('"branch_staff"'),
    "branch_staff must require the same staff-runtime attendance/checklist flow as cashier and chef",
  );
  assert.doesNotMatch(
    checkoutRequestBody,
    /checklist_incomplete|attendance_checklist_items|inventory_count_slips/,
    "checkout requests stay available when shift tasks are incomplete; manager approval owns the final checkout",
  );
  assert.ok(
    baseline.includes("WHEN 'guard' THEN 'branch_staff'") &&
      baseline.includes("WHEN 'cleaner' THEN 'branch_staff'") &&
      baseline.includes(
        "WHEN v_requester_role IN ('cashier', 'chef', 'branch_staff') THEN ARRAY['branch_manager']::text[]",
      ) &&
      baseline.includes(
        "IF v_requester_role NOT IN ('cashier', 'chef', 'branch_staff') THEN",
      ),
    "guard/cleaner must map to branch_staff and remain branch-manager checkout approvals",
  );
  assert.ok(
    approvalsPageSrc.includes("CHECKOUT_APPROVER_ROLES") &&
      approvalsPageSrc.includes("checkout_approval_target_roles") &&
      approvalsPageSrc.includes("has_permission_any") &&
      approvalsPageSrc.includes("has_permission") &&
      approvalsPageSrc.includes("HR_APPROVE_CHECKOUT"),
    "expected approval page to be manager-tier and permission scoped",
  );
});
