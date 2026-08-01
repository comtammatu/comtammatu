import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
