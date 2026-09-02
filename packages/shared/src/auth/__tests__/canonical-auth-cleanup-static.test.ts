import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, looksLikeDump } from "../../test-utils/active-sql";
import { resolve } from "node:path";
const repoRoot = resolve(import.meta.dirname, "../../../../..");

const root = join(import.meta.dirname, "../../../../..");
const migration = readSql(repoRoot, "supabase/migrations/20260718174604_canonical_auth_role_position_cleanup.sql");
const devSeed = readFileSync(
  join(root, "apps/web/tests/fixtures/supabase-e2e/tenant.sql"),
  "utf8",
);

test("auth provisioning and JWT output use one canonical claim chain", () => {
  assertSqlMatch(migration,
    /v_tenant_id := NULLIF\(NEW\.raw_app_meta_data ->> 'tenant_id', ''\)::bigint/,
  );
  assertSqlMatch(migration,
    /v_position_code := NULLIF\(NEW\.raw_app_meta_data ->> 'position_code', ''\)/,
  );
  assertSqlNotMatch(migration,
    /v_access_bucket\s*:=|COALESCE\([\s\S]{0,200}NEW\.raw_app_meta_data ->> 'role'/,
  );
  assertSqlMatch(migration,
    /jsonb_build_object\(\s*'tenant_id',[\s\S]*?'branch_id',[\s\S]*?'user_role',[\s\S]*?'position_code'/,
  );
  assertSqlMatch(migration, /operational_user_requires_active_owner_provisioner/);
  assertSqlNotMatch(migration, /COALESCE\(rt\.is_active, true\)/);
  assertSqlMatch(migration,
    /INSERT INTO public\.staff_permissions \([\s\S]*?v_template\.id/,
  );
  assertSqlMatch(migration,
    /DELETE FROM auth\.sessions session_row\s+WHERE session_row\.user_id = p_target_id/,
  );
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.admin_update_profile/,
  );
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.position_id_from_access_bucket/,
  );
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.auth_role_to_position/,
  );
});

test("minimal tenants repair missing canonical position templates", () => {
  assertSqlMatch(migration,
    /WHEN po\.code = 'owner' THEN ARRAY\([\s\S]*?FROM public\.permission_keys permission/,
  );
  assertSqlMatch(migration,
    /WHEN po\.code = 'branch_manager' THEN ARRAY\([\s\S]*?permission\.is_delegable_to_staff = true/,
  );
  assertSqlMatch(migration,
    /FROM canonical_branch_manager_default_permission_keys default_key[\s\S]*?WHERE EXISTS \(SELECT 1 FROM public\.permission_keys\)\s+AND \(\s*permission\.key IS NULL\s+OR permission\.is_delegable_to_staff IS DISTINCT FROM true\s*\)/,
  );
  assertSqlMatch(migration,
    /WHEN po\.code = 'cashier' THEN ARRAY\([\s\S]*?'pos:use'/,
  );
  assertSqlMatch(migration,
    /WHEN po\.code = 'chef' THEN ARRAY\([\s\S]*?'kds:use'/,
  );
  assertSqlMatch(migration,
    /po\.code IN \(\s*'owner',[\s\S]*?'guard'\s*\)/,
  );
  assertSqlMatch(migration, /canonical_position_template_count_invalid/);
});

test("local seed mirrors the canonical position template set", () => {
  for (const positionCode of [
    "owner",
    "branch_manager",
    "cashier",
    "chef",
    "kitchen_counter",
    "kitchen_helper",
    "grill_counter",
    "waiter",
    "cleaner",
    "guard",
  ]) {
    assert.match(devSeed, new RegExp(`'${positionCode}'`));
  }
  assert.match(
    devSeed,
    /\('kitchen_counter', 'kitchen_counter', ARRAY\['hr:request_leave','kds:mark_ready','kds:use'\]\)/,
  );
  assert.match(
    devSeed,
    /\('kitchen_helper', 'kitchen_helper', ARRAY\['hr:request_leave'\]\)/,
  );
  assert.match(
    devSeed,
    /\('waiter', 'waiter', ARRAY\['hr:request_leave','orders:read','orders:write','pos:confirm_payment','pos:reprint_receipt','pos:send_kitchen','pos:use'\]\)/,
  );
  assert.match(
    devSeed,
    /template\.position_code = 'owner'/,
  );
});

test("Branch Manager approval grants remain exact-branch and hierarchy guarded", () => {
  for (const key of ["hr:approve_checkout", "hr:approve_leave_request"]) {
    assertSqlMatch(migration, new RegExp(`'${key}'`));
  }
  assertSqlMatch(migration, /po\.code = 'branch_manager'/);
  assertSqlMatch(migration, /sp\.branch_id = p_branch_id/);
  assertSqlMatch(migration, /pr\.branch_id = p_branch_id/);
  assertSqlMatch(migration,
    /v_requester_role NOT IN \('cashier', 'chef', 'branch_staff'\)/,
  );
  assertSqlMatch(migration, /cannot_review_own_leave_request/);
  assertSqlMatch(migration, /cannot_force_close_own_attendance/);
  assertSqlMatch(migration,
    /p_tenant_id IS DISTINCT FROM public\.auth_tenant_id\(\)[\s\S]*?branch_row\.id = p_branch_id[\s\S]*?branch_row\.tenant_id = p_tenant_id/,
  );
  assertSqlMatch(migration,
    /v_approver_role = 'branch_manager'[\s\S]*?v_requester_role NOT IN \('cashier', 'chef', 'branch_staff'\)[\s\S]*?force_close_hierarchy_not_allowed/,
  );
});

test("personnel RLS and grants do not expose tenant-wide HR to Branch Manager", () => {
  if (looksLikeDump(migration)) return;
  const profilesSelectPolicy =
    /CREATE POLICY profiles_select_authorized[\s\S]*?\n\);/.exec(migration)?.[0];
  assert.ok(profilesSelectPolicy, "profiles_select_authorized policy must exist");
  assert.match(profilesSelectPolicy, /public\.auth_role\(\) = 'owner'/);
  assert.doesNotMatch(profilesSelectPolicy, /public\.auth_is_owner\(/);
  assertSqlMatch(migration, /DROP POLICY IF EXISTS profiles_select_admin/);
  assertSqlMatch(migration, /branch_id = public\.auth_branch_id\(\)/);
  assertSqlMatch(migration, /public\.has_permission\(branch_id, 'staff:view'\)/);
  assertSqlMatch(migration,
    /REVOKE ALL ON TABLE public\.leave_requests FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(migration, /GRANT SELECT ON TABLE public\.leave_requests/);
  assertSqlMatch(migration,
    /template_key\.permission_key <> ALL \(ARRAY\[[\s\S]*?'hr:view_employee'[\s\S]*?\]::text\[\]\)/,
  );
  assertSqlMatch(migration,
    /WHERE rt\.position_code = 'branch_manager'[\s\S]*?'hr:view_employee'/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.can_view_leave_entitlement/,
  );
  assertSqlMatch(migration,
    /pr\.branch_id = public\.auth_branch_id\(\)[\s\S]*?'hr:approve_leave_request'/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.get_leave_review_queue\([\s\S]*?requester_profile\.branch_id = p_branch_id[\s\S]*?IN \('cashier', 'chef', 'branch_staff'\)/,
  );
  assertSqlMatch(migration,
    /OR v_requester_branch IS DISTINCT FROM NEW\.branch_id/,
  );
});

test("retired positions, checklist role column, and notification audiences are removed", () => {
  assertSqlMatch(migration, /'archived_staff'/);
  assertSqlMatch(migration,
    /private\.staff_role_from_position_code\(po\.code\) IS NULL/,
  );
  assertSqlMatch(migration,
    /ALTER TABLE public\.shift_checklist_templates DROP COLUMN IF EXISTS role_code/,
  );
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.canonicalize_notification\(\)/,
  );
  assertSqlMatch(migration, /notification_requires_canonical_target_role/);
  assertSqlMatch(migration,
    /active_unmapped_position_requires_explicit_reassignment/,
  );
  assertSqlMatch(migration,
    /ALTER TABLE public\.attendance_records\s+DROP COLUMN IF EXISTS code_verified,\s+DROP COLUMN IF EXISTS check_out_code_verified/,
  );
  assertSqlMatch(migration, /legacy_attendance_verification_state_remains/);
  assertSqlMatch(migration, /retired_role_literal_remains_in_catalog/);
  assertSqlMatch(migration, /legacy_auth_identifier_remains_in_catalog/);
  assertSqlMatch(migration, /legacy_route_remains_in_catalog/);
  assertSqlMatch(migration, /legacy_notification_payload_remains/);
  assertSqlMatch(migration, /retired_policy_name_remains_in_catalog/);
  assertSqlMatch(migration,
    /'staff_permissions_select_admin',[\s\S]*?'staff_permissions_select_authorized'/,
  );
  assertSqlMatch(migration, /archive_legacy_profile_assignment/);
  assertSqlMatch(migration, /archive_legacy_role_template/);
  assertSqlMatch(migration, /archived_source_template_id/);
  assertSqlMatch(migration, /canonical_position_template_count_invalid/);
  assertSqlMatch(migration,
    /manual_permission_outside_canonical_template_requires_review/,
  );
  assertSqlMatch(migration,
    /canonical_cross_template_permission_without_owner_audit/,
  );
  assertSqlMatch(migration,
    /audit_row\.action = 'apply_template'[\s\S]*?audit_row\.source_template_id = sp\.source_template[\s\S]*?actor_position\.code = 'owner'/,
  );
  assertSqlMatch(migration, /owner_template_grant_to_non_owner_requires_revoke/);
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION private\.enforce_staff_permission_boundary/,
  );
  assertSqlMatch(migration, /owner_template_cannot_be_applied_to_staff/);
  assertSqlMatch(migration, /owner_only_permission_cannot_be_delegated/);
  assertSqlMatch(migration, /approval_permission_requires_branch_manager/);
  assertSqlMatch(migration,
    /ALTER COLUMN is_delegable_to_staff SET DEFAULT false/,
  );
  assertSqlMatch(migration, /pk\.is_delegable_to_staff = true/);
  assertSqlMatch(migration, /canonical_position_permission_drift_remains/);
});
