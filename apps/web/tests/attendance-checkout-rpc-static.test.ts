import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const baseline = read("supabase/migrations/00000000000000_baseline.sql");
const notificationDedupHistory = read(
  "supabase/migration-archive/20260709104015_fix_attendance_checkout_notification_conflict.sql",
);

function pgDumpBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing pg_dump block: ${marker}`);
  const next = source.indexOf("\n\n--\n-- Name:", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const checkoutRequestFunction = pgDumpBlock(
  baseline,
  "-- Name: employee_request_clock_out(bigint, bigint, bigint); Type: FUNCTION;",
);
const forceCloseFunction = pgDumpBlock(
  baseline,
  "-- Name: admin_force_close_attendance(bigint, bigint, bigint, uuid, text); Type: FUNCTION;",
);
const checkoutRequestAcl = pgDumpBlock(
  baseline,
  "-- Name: FUNCTION employee_request_clock_out(p_tenant_id bigint, p_employee_id bigint, p_attendance_id bigint); Type: ACL;",
);
const forceCloseAcl = pgDumpBlock(
  baseline,
  "-- Name: FUNCTION admin_force_close_attendance(p_tenant_id bigint, p_branch_id bigint, p_attendance_id bigint, p_approved_by uuid, p_note text); Type: ACL;",
);
const notificationDedupIndex = pgDumpBlock(
  baseline,
  "-- Name: ux_notifications_dedup; Type: INDEX;",
);

test("attendance checkout notification upsert has a matching unique arbiter", () => {
  assert.match(
    checkoutRequestFunction,
    /ON CONFLICT\s*\(\s*tenant_id\s*,\s*dedup_key\s*\)\s*WHERE\s+dedup_key\s+IS\s+NOT\s+NULL/i,
    "employee_request_clock_out must target the partial notification dedup index",
  );
  assert.match(
    notificationDedupHistory,
    /dedup_key IS NOT NULL[\s\S]*DELETE FROM public\.notifications[\s\S]*d\.rn > 1/i,
    "the historical repair must clear duplicate non-null dedup keys before the unique index was rebuilt",
  );
  assert.match(
    notificationDedupIndex,
    /CREATE UNIQUE INDEX ux_notifications_dedup\s+ON public\.notifications USING btree\s*\(\s*tenant_id\s*,\s*dedup_key\s*\)\s+WHERE\s*\(\s*dedup_key IS NOT NULL\s*\);/i,
    "the current baseline must expose the exact unique index used by ON CONFLICT",
  );
});

test("attendance checkout RPC exposure stays scoped to intended callers", () => {
  assert.match(
    forceCloseFunction,
    /CREATE FUNCTION public\.admin_force_close_attendance[\s\S]*SECURITY DEFINER[\s\S]*auth\.uid\(\)[\s\S]*public\.has_permission\(p_branch_id, 'hr:approve_checkout'\)/,
    "browser-callable force-close RPC must carry its own auth and permission boundary",
  );
  assert.match(
    checkoutRequestAcl,
    /REVOKE ALL ON FUNCTION public\.employee_request_clock_out\(p_tenant_id bigint, p_employee_id bigint, p_attendance_id bigint\) FROM PUBLIC;/,
  );
  assert.match(
    checkoutRequestAcl,
    /GRANT ALL ON FUNCTION public\.employee_request_clock_out\(p_tenant_id bigint, p_employee_id bigint, p_attendance_id bigint\) TO service_role;/,
  );
  assert.doesNotMatch(checkoutRequestAcl, / TO (?:anon|authenticated);/);
  assert.match(
    forceCloseAcl,
    /REVOKE ALL ON FUNCTION public\.admin_force_close_attendance\(p_tenant_id bigint, p_branch_id bigint, p_attendance_id bigint, p_approved_by uuid, p_note text\) FROM PUBLIC;/,
  );
  assert.match(
    forceCloseAcl,
    /GRANT ALL ON FUNCTION public\.admin_force_close_attendance\(p_tenant_id bigint, p_branch_id bigint, p_attendance_id bigint, p_approved_by uuid, p_note text\) TO authenticated;/,
  );
  assert.match(forceCloseAcl, / TO service_role;/);
  assert.doesNotMatch(forceCloseAcl, / TO anon;/);
});

test("employee checkout accepts the current or previous business date", () => {
  assert.match(
    checkoutRequestFunction,
    /v_now_local timestamp := now\(\) AT TIME ZONE 'Asia\/Ho_Chi_Minh'/,
  );
  assert.match(
    checkoutRequestFunction,
    /ar\.date BETWEEN v_calendar_date - 1 AND v_calendar_date/,
  );
  assert.match(
    checkoutRequestFunction,
    /FOR UPDATE OF ar[\s\S]*date = v_record\.date/,
  );
  assert.doesNotMatch(
    checkoutRequestAcl,
    /GRANT ALL ON FUNCTION public\.employee_request_clock_out[^;]*authenticated/,
  );
});

test("force-close waits for the scheduled shift end", () => {
  assert.match(
    forceCloseFunction,
    /SECURITY DEFINER[\s\S]*auth\.uid\(\)[\s\S]*public\.has_permission\(p_branch_id, 'hr:approve_checkout'\)/,
  );
  assert.match(
    forceCloseFunction,
    /v_shift_end_at := v_record_date \+ v_shift_end[\s\S]*v_shift_end <= v_shift_start[\s\S]*INTERVAL '1 day'/,
  );
  assert.match(
    forceCloseFunction,
    /IF v_now_local < v_shift_end_at THEN[\s\S]*stale_attendance_request_not_found/,
  );
  assert.match(
    forceCloseAcl,
    /REVOKE ALL ON FUNCTION public\.admin_force_close_attendance[\s\S]*GRANT ALL ON FUNCTION public\.admin_force_close_attendance/,
    "the baseline must keep the force-close function revoked from PUBLIC",
  );
});
