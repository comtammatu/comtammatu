import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { extractSqlFunction, readSql } from "./_lib/active-sql.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const kdsMigration = readSql(repoRoot, "supabase/migrations/20260629190446_kds_inline_branch_scope.sql");
const scopeMigration = readSql(repoRoot, "supabase/migrations/20260629190445_auth_rls_permission_scope_cleanup.sql");
const _canonicalTemplateMigration = readSql(repoRoot, "supabase/migrations/20260630031456_canonicalize_branch_manager_template.sql");
const authTypes = readFileSync(
  resolve(repoRoot, "packages/shared/src/auth/types.ts"),
  "utf8",
);
const staffPermissionBoundaryMigration = readSql(repoRoot, "supabase/migrations/20260717164132_harden_staff_permission_boundary.sql");
const authUserProfileTriggerMigration = readSql(repoRoot, "supabase/migrations/20260727120002_restore_auth_user_profile_trigger.sql");

test("KDS branch scope cleanup does not call can_access_branch from active RPC bodies", () => {
  for (const name of [
    "complete_kds_tickets",
    "mark_kds_item_out_of_stock",
    "recall_kds_ticket",
  ]) {
    const body = extractSqlFunction(kdsMigration, name);
    assert.notEqual(body, "", `missing function ${name}`);
    assert.doesNotMatch(body, /can_access_branch/);
    assert.match(body, /public\.auth_branch_id\(\)/);
  }
});

test("permission-scope cleanup normalizes existing rows and keeps template grants per-key scoped", () => {
  assert.match(scopeMigration, /CREATE OR REPLACE FUNCTION public\.apply_template_to_user/);
  assert.match(scopeMigration, /CREATE OR REPLACE FUNCTION public\.sync_missing_permissions_from_template/);
});

test("active auth templates and target-role lists use canonical access names", () => {
  const retiredNames = [
    ["super", "manager"].join("_"),
    ["area", "manager"].join("_"),
    ["quan", "ly", "vung"].join("_"),
    ["quan", "ly", "CN"].join("_"),
    ["cashier", "floor"].join("_"),
    ["phu", "bep"].join("_"),
    ["kho", "truong"].join("_"),
    ["bep", "truong"].join("_"),
  ];
  const checkedSources = [
    "apps/web/tests/fixtures/supabase-e2e/tenant.sql",
    "supabase/tests/branch_manager_kds_permissions_test.sql",
  ];

  for (const file of checkedSources) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    for (const retired of retiredNames) {
      assert.doesNotMatch(source, new RegExp(`\\b${retired}\\b`), `${file}: ${retired}`);
    }
  }

  const tenantSql = readFileSync(
    resolve(repoRoot, "apps/web/tests/fixtures/supabase-e2e/tenant.sql"),
    "utf8",
  );
  for (const canonicalName of [
    "cashier",
    "kitchen_helper",
    "branch_manager",
  ]) {
    assert.match(
      tenantSql,
      new RegExp(`'${canonicalName}'`),
      `seed should keep canonical ${canonicalName}`,
    );
  }
});

test("waiter remains a position code mapped to branch_staff, not a StaffRole", () => {
  assert.doesNotMatch(
    authTypes,
    /export const STAFF_ROLES = \[[\s\S]*?"waiter"/,
  );
  assert.match(authTypes, /waiter: "branch_staff"/);
});

test("staff permission rows are read-only to authenticated clients through one policy", () => {
  assert.match(
    staffPermissionBoundaryMigration,
    /CREATE POLICY staff_permissions_select ON public\.staff_permissions FOR SELECT TO authenticated/,
  );
  assert.match(
    staffPermissionBoundaryMigration,
    /has_permission\(NULL::bigint, 'staff:assign_permission'/,
  );
});

test("fresh Cloud environments restore the canonical auth user profile trigger", () => {
  assert.match(
    authUserProfileTriggerMigration,
    /DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users/,
  );
  assert.match(
    authUserProfileTriggerMigration,
    /CREATE TRIGGER on_auth_user_created\s+AFTER INSERT ON auth\.users\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.handle_new_user\(\)/,
  );
  assert.equal(
    [
      ...authUserProfileTriggerMigration.matchAll(
        /CREATE TRIGGER on_auth_user_created/g,
      ),
    ].length,
    1,
  );
  assert.doesNotMatch(authUserProfileTriggerMigration, /INSERT INTO auth\.users/);
});
