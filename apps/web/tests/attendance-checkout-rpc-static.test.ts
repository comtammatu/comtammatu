import { resolve } from "node:path";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const read = (path: string) => readSql(repoRoot, path);

const integrityMigration = read(
  "supabase/migrations/20260709094314_attendance_shift_integrity.sql",
);
const patchMigration = read(
  "supabase/migrations/20260709104015_fix_attendance_checkout_notification_conflict.sql",
);
const forceCloseAfterShiftEndMigration = read(
  "supabase/migrations/20260710141738_allow_force_close_after_shift_end.sql",
);
const overnightBusinessDateMigration = read(
  "supabase/migrations/20260711143450_fix_overnight_attendance_business_date.sql",
);
const inventoryShiftScopeMigration = read(
  "supabase/migrations/20260722074001_fix_attendance_checkout_inventory_shift_scope.sql",
);

test("attendance checkout notification upsert has a matching unique arbiter", () => {
  assertSqlMatch(integrityMigration,
    /ON CONFLICT\s*\(\s*tenant_id\s*,\s*dedup_key\s*\)\s*WHERE\s+dedup_key\s+IS\s+NOT\s+NULL/i,
    "employee_request_clock_out must target the partial notification dedup index",
  );
  assertSqlMatch(patchMigration,
    /dedup_key IS NOT NULL[\s\S]*DELETE FROM public\.notifications[\s\S]*d\.rn > 1/i,
    "migration must clear duplicate non-null dedup keys before rebuilding the unique index",
  );
  assertSqlMatch(patchMigration,
    /DROP INDEX IF EXISTS public\.ux_notifications_dedup;/i,
  );
  assertSqlMatch(patchMigration,
    /CREATE UNIQUE INDEX ux_notifications_dedup\s+ON public\.notifications USING btree\s*\(\s*tenant_id\s*,\s*dedup_key\s*\)\s+WHERE\s*\(\s*dedup_key IS NOT NULL\s*\);/i,
    "migration must recreate the exact unique index used by ON CONFLICT",
  );
});

test("attendance checkout RPC exposure stays scoped to intended callers", () => {
  assertSqlMatch(patchMigration,
    /CREATE OR REPLACE FUNCTION public\.admin_force_close_attendance[\s\S]*SECURITY DEFINER[\s\S]*auth\.uid\(\)[\s\S]*public\.has_permission\(p_branch_id, 'hr:approve_checkout'\)/,
    "browser-callable force-close RPC must carry its own auth and permission boundary",
  );
  assertSqlMatch(overnightBusinessDateMigration,
    /REVOKE ALL ON FUNCTION public\.employee_request_clock_out\(bigint, bigint, bigint\) FROM PUBLIC, anon, authenticated;/,
  );
  assertSqlMatch(overnightBusinessDateMigration,
    /GRANT EXECUTE ON FUNCTION public\.employee_request_clock_out\(bigint, bigint, bigint\) TO service_role;/,
  );
  assertSqlMatch(patchMigration,
    /REVOKE ALL ON FUNCTION public\.admin_force_close_attendance\(bigint, bigint, bigint, uuid, text\) FROM PUBLIC, anon, authenticated;/,
  );
  assertSqlMatch(patchMigration,
    /GRANT EXECUTE ON FUNCTION public\.admin_force_close_attendance\(bigint, bigint, bigint, uuid, text\) TO service_role, authenticated;/,
  );
  assertSqlNotMatch(patchMigration,
    /GRANT ALL ON FUNCTION public\.admin_force_close_attendance/i,
    "force-close RPC should not use broad GRANT ALL",
  );
});

test("employee checkout accepts the current or previous business date", () => {
  assertSqlMatch(overnightBusinessDateMigration,
    /v_now_local timestamp := now\(\) AT TIME ZONE 'Asia\/Ho_Chi_Minh'/,
  );
  assertSqlMatch(overnightBusinessDateMigration,
    /ar\.date BETWEEN v_calendar_date - 1 AND v_calendar_date/,
  );
  assertSqlMatch(overnightBusinessDateMigration,
    /FOR UPDATE OF ar[\s\S]*date = v_record\.date/,
  );
  assertSqlNotMatch(overnightBusinessDateMigration,
    /GRANT EXECUTE ON FUNCTION public\.employee_request_clock_out[^;]*authenticated/,
  );
});

test("employee checkout inventory gate is scoped to the attendance shift", () => {
  assertSqlMatch(inventoryShiftScopeMigration,
    /CREATE OR REPLACE FUNCTION public\.employee_request_clock_out/,
  );
  assertSqlMatch(inventoryShiftScopeMigration,
    /AND \(a\.shift_id IS NULL OR a\.shift_id = v_record\.shift_id\)/,
    "global and current-shift assignments should block checkout",
  );
  assertSqlMatch(inventoryShiftScopeMigration,
    /AND s\.shift_id IS NOT DISTINCT FROM v_record\.shift_id/,
    "completed slips must belong to the attendance shift",
  );
  assertSqlMatch(inventoryShiftScopeMigration,
    /RAISE EXCEPTION 'checklist_incomplete' USING ERRCODE = '23514'/,
  );
  assertSqlMatch(inventoryShiftScopeMigration,
    /REVOKE ALL ON FUNCTION public\.employee_request_clock_out\(bigint, bigint, bigint\) FROM PUBLIC, anon, authenticated;/,
  );
  assertSqlMatch(inventoryShiftScopeMigration,
    /GRANT EXECUTE ON FUNCTION public\.employee_request_clock_out\(bigint, bigint, bigint\) TO service_role;/,
  );
  assertSqlNotMatch(inventoryShiftScopeMigration,
    /GRANT EXECUTE ON FUNCTION public\.employee_request_clock_out[^;]*authenticated/,
  );
});

test("force-close waits for the scheduled shift end", () => {
  assertSqlMatch(forceCloseAfterShiftEndMigration,
    /SECURITY DEFINER[\s\S]*auth\.uid\(\)[\s\S]*public\.has_permission\(p_branch_id, 'hr:approve_checkout'\)/,
  );
  assertSqlMatch(forceCloseAfterShiftEndMigration,
    /v_shift_end_at := v_record_date \+ v_shift_end[\s\S]*v_shift_end <= v_shift_start[\s\S]*INTERVAL '1 day'/,
  );
  assertSqlMatch(forceCloseAfterShiftEndMigration,
    /IF v_now_local < v_shift_end_at THEN[\s\S]*stale_attendance_request_not_found/,
  );
  assertSqlMatch(forceCloseAfterShiftEndMigration,
    /REVOKE ALL ON FUNCTION public\.admin_force_close_attendance[\s\S]*GRANT EXECUTE ON FUNCTION public\.admin_force_close_attendance/,
  );
  assertSqlNotMatch(forceCloseAfterShiftEndMigration,
    /GRANT ALL ON FUNCTION public\.admin_force_close_attendance/i,
  );
});
