import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Employee Daily Work v1 migration hardens attendance and adds checklist RPCs", () => {
  const migration = read(
    "supabase/migrations/20260609093000_employee_daily_work_v1.sql",
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
  const actionSrc = read(
    "apps/web/app/(protected)/employee/clock/actions.ts",
  );
  const clientSrc = read(
    "apps/web/app/(protected)/employee/clock/clock-client.tsx",
  );

  assert.ok(
    actionSrc.includes("clockInWithPhoto") &&
      actionSrc.includes("toggleChecklistItem") &&
      actionSrc.includes("clockOutWithCode"),
    "expected new Employee Daily Work server actions",
  );
  assert.ok(
    actionSrc.includes("employee_clock_in_with_checklist") &&
      actionSrc.includes("employee_clock_out_with_code") &&
      actionSrc.includes(".remove([photoPath])"),
    "expected clock-in/out to use RPCs and clean up uploaded photo on RPC failure",
  );

  for (const forbidden of [
    "navigator.geolocation",
    "MAX_DISTANCE_METERS",
    "haversineMeters",
    "latitude",
    "longitude",
  ]) {
    assert.ok(!clientSrc.includes(forbidden), `client must not contain ${forbidden}`);
    assert.ok(!actionSrc.includes(forbidden), `action must not contain ${forbidden}`);
  }
});

