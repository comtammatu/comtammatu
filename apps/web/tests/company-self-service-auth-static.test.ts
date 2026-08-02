import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("company self-service is authorized by a live binding only", () => {
  const migration = read(
    "supabase/migrations/20260801205519_company_self_service_binding.sql",
  );
  const proxy = read("apps/web/proxy.ts");
  const types = read("packages/shared/src/auth/types.ts");

  for (const contract of [
    "'self:access'",
    "'self_service_member'",
    "private.sync_self_service_binding()",
    "trg_profiles_self_service_binding",
    "binding.valid_until IS NULL",
    "THEN 'self_service'",
  ]) {
    assert.ok(migration.includes(contract), contract);
  }
  assert.doesNotMatch(migration, /WHEN 'hr_manager' THEN 'branch_staff'/);
  assert.match(migration, /IF v_user_role IS NULL THEN\s+RETURN;/);
  assert.match(proxy, /p_key: PERMISSION_KEYS\.SELF_ACCESS/);
  assert.ok(
    proxy.indexOf("p_key: PERMISSION_KEYS.SELF_ACCESS") <
      proxy.indexOf("const canonicalPath = canonicalizeSelfServicePath"),
  );

  const staffRoles = /export const STAFF_ROLES = \[([\s\S]*?)\] as const/.exec(
    types,
  )?.[1];
  assert.ok(staffRoles?.includes('"self_service"'));
  assert.equal(staffRoles?.includes('"office"'), false);
});

test("zero-module company positions remain selectable without a role template", () => {
  const accountActions = read("apps/web/app/(protected)/hr/staff/actions.ts");
  const employeeActions = read("apps/web/app/(protected)/hr/actions.ts");
  const employeePage = read("apps/web/app/(protected)/hr/page.tsx");
  const accountLoader = read(
    "apps/web/app/(protected)/hr/staff/load-staff-accounts.ts",
  );

  assert.match(accountActions, /requiredBranchKind === "unassigned"/);
  assert.match(employeeActions, /requiredBranchKind !== "unassigned"/);
  assert.doesNotMatch(employeePage, /role === "unassigned"/);
  assert.doesNotMatch(accountLoader, /bucket === "unassigned"/);
});

test("assigned company staff can clock in only through live self-service scope", () => {
  const todayWorkState = read(
    "apps/web/lib/staff-runtime/_lib/today-work-state.ts",
  );
  const migrationName = readdirSync(resolve(root, "supabase/migrations")).find(
    (name) => name.endsWith("_allow_company_self_service_clock_in.sql"),
  );

  assert.ok(migrationName, "missing company self-service clock-in migration");
  const migration = read(`supabase/migrations/${migrationName}`);

  assert.match(todayWorkState, /Boolean\(assignedShift\)/);
  assert.match(todayWorkState, /claims\.user_role !== "self_service"/);
  assert.match(migration, /v_is_company_self_service boolean/);
  assert.match(migration, /binding\.role_code = 'self_service_member'/);
  assert.match(migration, /binding\.valid_from <= v_now/);
  assert.match(
    migration,
    /binding\.valid_until IS NULL OR binding\.valid_until > v_now/,
  );
  assert.match(migration, /IF v_is_company_self_service THEN/);
  assert.match(
    migration,
    /sa\.branch_id IS NOT DISTINCT FROM v_assigned_branch_id/,
  );
  assert.match(migration, /RAISE EXCEPTION 'shift_assignment_required'/);
});
