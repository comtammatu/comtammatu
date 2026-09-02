import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readSql } from "./_lib/active-sql.ts";

const actionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/leave-request-actions.ts"),
  "utf8",
);
const branchApprovalsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/team/leave-approvals/branch-leave-approvals-client.tsx",
  ),
  "utf8",
);
const migrationSource = readSql(process.cwd(), "supabase/migrations/20260901002446_approve_leave_with_roster_resolution.sql");

const approveActionSource = actionsSource.slice(
  actionsSource.indexOf("export const approveLeaveRequest"),
  actionsSource.indexOf("const rejectSchema"),
);

test("leave approval resolves roster assignments through one atomic RPC", () => {
  assert.match(
    approveActionSource,
    /\.rpc\(\s*"approve_leave_request_with_roster"/,
  );
  assert.match(approveActionSource, /p_shift_resolution:/);
  assert.match(approveActionSource, /p_replacement_employee_id:/);
  assert.doesNotMatch(
    approveActionSource,
    /\.from\("shift_assignments"\)[\s\S]*\.(?:insert|upsert|update|delete)\(/,
  );
});

test("leave approval derives employee and date scope from the request", () => {
  assert.match(
    actionsSource,
    /shiftResolution:\s*z\.enum\(\["keep", "unassign", "substitute"\]\)/,
  );
  assert.doesNotMatch(
    approveActionSource,
    /data\.(?:employeeId|startDate|endDate)/,
  );
  assert.doesNotMatch(
    branchApprovalsSource,
    /approveLeaveRequest\(\{[\s\S]*?(?:employeeId|startDate|endDate):/,
  );
});

test("branch leave approval sends an explicit roster resolution", () => {
  assert.match(
    branchApprovalsSource,
    /shiftResolution:\s*substitutionMode === "substitute"[\s\S]*?"substitute"[\s\S]*?substitutionMode === "unassign"[\s\S]*?"unassign"[\s\S]*?"keep"/,
  );
});

test("leave roster resolution is request-scoped, permission-checked, and attendance-safe", () => {
  for (const expected of [
    "private.authorize_leave_review(p_request_id)",
    "p_shift_resolution IS NULL",
    "public.has_permission(v_request.branch_id, 'hr:assign_shift')",
    "assignment.employee_id = v_request.employee_id",
    "assignment.work_date BETWEEN v_request.start_date AND v_request.end_date",
    "attendance.shift_id IS NOT DISTINCT FROM assignment.shift_id",
    "v_replacement_branch_id IS DISTINCT FROM v_request.branch_id",
    "ON CONFLICT (tenant_id, employee_id, work_date, shift_id)",
    "GET DIAGNOSTICS v_assignments_changed = ROW_COUNT",
  ]) {
    assert.ok(migrationSource.includes(expected), `missing ${expected}`);
  }
  assert.match(
    migrationSource,
    /CREATE OR REPLACE FUNCTION public\.approve_leave_request_with_roster[\s\S]*?UPDATE public\.leave_requests[\s\S]*?RETURN jsonb_build_object/,
  );
});

test("authenticated roster writes remain RPC-only", () => {
  assert.match(
    migrationSource,
    /CREATE OR REPLACE FUNCTION public\.approve_leave_request_with_roster\(/,
  );
});
