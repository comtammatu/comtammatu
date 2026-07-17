import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const integrityMigration = read(
  "supabase/migration-archive/20260709094314_attendance_shift_integrity.sql",
);
const patchMigration = read(
  "supabase/migration-archive/20260709104015_fix_attendance_checkout_notification_conflict.sql",
);
const forceCloseAfterShiftEndMigration = read(
  "supabase/migration-archive/20260710141738_allow_force_close_after_shift_end.sql",
);
const overnightBusinessDateMigration = read(
  "supabase/migration-archive/20260711143450_fix_overnight_attendance_business_date.sql",
);

test("attendance checkout notification upsert has a matching unique arbiter", () => {
  assert.match(
    integrityMigration,
    /ON CONFLICT\s*\(\s*tenant_id\s*,\s*dedup_key\s*\)\s*WHERE\s+dedup_key\s+IS\s+NOT\s+NULL/i,
    "employee_request_clock_out must target the partial notification dedup index",
  );
  assert.match(
    patchMigration,
    /dedup_key IS NOT NULL[\s\S]*DELETE FROM public\.notifications[\s\S]*d\.rn > 1/i,
    "migration must clear duplicate non-null dedup keys before rebuilding the unique index",
  );
  assert.match(
    patchMigration,
    /DROP INDEX IF EXISTS public\.ux_notifications_dedup;/i,
  );
  assert.match(
    patchMigration,
    /CREATE UNIQUE INDEX ux_notifications_dedup\s+ON public\.notifications USING btree\s*\(\s*tenant_id\s*,\s*dedup_key\s*\)\s+WHERE\s*\(\s*dedup_key IS NOT NULL\s*\);/i,
    "migration must recreate the exact unique index used by ON CONFLICT",
  );
});

test("attendance checkout RPC exposure stays scoped to intended callers", () => {
  assert.match(
    patchMigration,
    /CREATE OR REPLACE FUNCTION public\.admin_force_close_attendance[\s\S]*SECURITY DEFINER[\s\S]*auth\.uid\(\)[\s\S]*public\.has_permission\(p_branch_id, 'hr:approve_checkout'\)/,
    "browser-callable force-close RPC must carry its own auth and permission boundary",
  );
  assert.match(
    overnightBusinessDateMigration,
    /REVOKE ALL ON FUNCTION public\.employee_request_clock_out\(bigint, bigint, bigint\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    overnightBusinessDateMigration,
    /GRANT EXECUTE ON FUNCTION public\.employee_request_clock_out\(bigint, bigint, bigint\) TO service_role;/,
  );
  assert.match(
    patchMigration,
    /REVOKE ALL ON FUNCTION public\.admin_force_close_attendance\(bigint, bigint, bigint, uuid, text\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    patchMigration,
    /GRANT EXECUTE ON FUNCTION public\.admin_force_close_attendance\(bigint, bigint, bigint, uuid, text\) TO service_role, authenticated;/,
  );
  assert.doesNotMatch(
    patchMigration,
    /GRANT ALL ON FUNCTION public\.admin_force_close_attendance/i,
    "force-close RPC should not use broad GRANT ALL",
  );
});

test("employee checkout accepts the current or previous business date", () => {
  assert.match(
    overnightBusinessDateMigration,
    /v_now_local timestamp := now\(\) AT TIME ZONE 'Asia\/Ho_Chi_Minh'/,
  );
  assert.match(
    overnightBusinessDateMigration,
    /ar\.date BETWEEN v_calendar_date - 1 AND v_calendar_date/,
  );
  assert.match(
    overnightBusinessDateMigration,
    /FOR UPDATE OF ar[\s\S]*date = v_record\.date/,
  );
  assert.doesNotMatch(
    overnightBusinessDateMigration,
    /GRANT EXECUTE ON FUNCTION public\.employee_request_clock_out[^;]*authenticated/,
  );
});

test("force-close waits for the scheduled shift end", () => {
  assert.match(
    forceCloseAfterShiftEndMigration,
    /SECURITY DEFINER[\s\S]*auth\.uid\(\)[\s\S]*public\.has_permission\(p_branch_id, 'hr:approve_checkout'\)/,
  );
  assert.match(
    forceCloseAfterShiftEndMigration,
    /v_shift_end_at := v_record_date \+ v_shift_end[\s\S]*v_shift_end <= v_shift_start[\s\S]*INTERVAL '1 day'/,
  );
  assert.match(
    forceCloseAfterShiftEndMigration,
    /IF v_now_local < v_shift_end_at THEN[\s\S]*stale_attendance_request_not_found/,
  );
  assert.match(
    forceCloseAfterShiftEndMigration,
    /REVOKE ALL ON FUNCTION public\.admin_force_close_attendance[\s\S]*GRANT EXECUTE ON FUNCTION public\.admin_force_close_attendance/,
  );
  assert.doesNotMatch(
    forceCloseAfterShiftEndMigration,
    /GRANT ALL ON FUNCTION public\.admin_force_close_attendance/i,
  );
});
