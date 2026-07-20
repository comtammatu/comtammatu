import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "../../../../..");
const migration = readFileSync(
  join(
    root,
    "supabase/migration-archive/20260718174604_canonical_auth_role_position_cleanup.sql",
  ),
  "utf8",
);
const devSeed = readFileSync(
  join(root, "apps/web/tests/fixtures/supabase-e2e/tenant.sql"),
  "utf8",
);

test("auth provisioning and JWT output use one canonical claim chain", () => {
  assert.match(
    migration,
    /v_tenant_id := NULLIF\(NEW\.raw_app_meta_data ->> 'tenant_id', ''\)::bigint/,
  );
  assert.match(
    migration,
    /v_position_code := NULLIF\(NEW\.raw_app_meta_data ->> 'position_code', ''\)/,
  );
  assert.doesNotMatch(
    migration,
    /v_access_bucket\s*:=|COALESCE\([\s\S]{0,200}NEW\.raw_app_meta_data ->> 'role'/,
  );
  assert.match(
    migration,
    /jsonb_build_object\(\s*'tenant_id',[\s\S]*?'branch_id',[\s\S]*?'user_role',[\s\S]*?'position_code'/,
  );
  assert.match(migration, /operational_user_requires_active_owner_provisioner/);
  assert.doesNotMatch(migration, /COALESCE\(rt\.is_active, true\)/);
  assert.match(
    migration,
    /INSERT INTO public\.staff_permissions \([\s\S]*?v_template\.id/,
  );
  assert.match(
    migration,
    /DELETE FROM auth\.sessions session_row\s+WHERE session_row\.user_id = p_target_id/,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.admin_update_profile/,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.position_id_from_access_bucket/,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.auth_role_to_position/,
  );
});

test("minimal tenants repair missing canonical position templates", () => {
  assert.match(
    migration,
    /WHEN po\.code = 'owner' THEN ARRAY\([\s\S]*?FROM public\.permission_keys permission/,
  );
  assert.match(
    migration,
    /WHEN po\.code = 'branch_manager' THEN ARRAY\([\s\S]*?permission\.is_delegable_to_staff = true/,
  );
  assert.match(
    migration,
    /FROM canonical_branch_manager_default_permission_keys default_key[\s\S]*?WHERE EXISTS \(SELECT 1 FROM public\.permission_keys\)\s+AND \(\s*permission\.key IS NULL\s+OR permission\.is_delegable_to_staff IS DISTINCT FROM true\s*\)/,
  );
  assert.match(
    migration,
    /WHEN po\.code = 'cashier' THEN ARRAY\([\s\S]*?'pos:use'/,
  );
  assert.match(
    migration,
    /WHEN po\.code = 'chef' THEN ARRAY\([\s\S]*?'kds:use'/,
  );
  assert.match(
    migration,
    /po\.code IN \(\s*'owner',[\s\S]*?'guard'\s*\)/,
  );
  assert.match(migration, /canonical_position_template_count_invalid/);
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
    "cleaner",
    "guard",
  ]) {
    assert.match(devSeed, new RegExp(`'${positionCode}'`));
  }
  assert.match(
    devSeed,
    /\('kitchen_helper', 'kitchen_helper', ARRAY\['hr:request_leave','kds:mark_ready','kds:use'\]\)/,
  );
  assert.match(
    devSeed,
    /template\.position_code = 'owner'/,
  );
});

test("Branch Manager approval grants remain exact-branch and hierarchy guarded", () => {
  for (const key of ["hr:approve_checkout", "hr:approve_leave_request"]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /po\.code = 'branch_manager'/);
  assert.match(migration, /sp\.branch_id = p_branch_id/);
  assert.match(migration, /pr\.branch_id = p_branch_id/);
  assert.match(
    migration,
    /v_requester_role NOT IN \('cashier', 'chef', 'branch_staff'\)/,
  );
  assert.match(migration, /cannot_review_own_leave_request/);
  assert.match(migration, /cannot_force_close_own_attendance/);
  assert.match(
    migration,
    /p_tenant_id IS DISTINCT FROM public\.auth_tenant_id\(\)[\s\S]*?branch_row\.id = p_branch_id[\s\S]*?branch_row\.tenant_id = p_tenant_id/,
  );
  assert.match(
    migration,
    /v_approver_role = 'branch_manager'[\s\S]*?v_requester_role NOT IN \('cashier', 'chef', 'branch_staff'\)[\s\S]*?force_close_hierarchy_not_allowed/,
  );
});

test("personnel RLS and grants do not expose tenant-wide HR to Branch Manager", () => {
  const profilesSelectPolicy =
    /CREATE POLICY profiles_select_authorized[\s\S]*?\n\);/.exec(migration)?.[0];

  assert.ok(profilesSelectPolicy);
  assert.match(profilesSelectPolicy, /public\.auth_role\(\) = 'owner'/);
  assert.doesNotMatch(profilesSelectPolicy, /public\.auth_is_owner\(/);
  assert.match(migration, /DROP POLICY IF EXISTS profiles_select_admin/);
  assert.match(migration, /branch_id = public\.auth_branch_id\(\)/);
  assert.match(migration, /public\.has_permission\(branch_id, 'staff:view'\)/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.leave_requests FROM PUBLIC, anon, authenticated/,
  );
  assert.match(migration, /GRANT SELECT ON TABLE public\.leave_requests/);
  assert.match(
    migration,
    /template_key\.permission_key <> ALL \(ARRAY\[[\s\S]*?'hr:view_employee'[\s\S]*?\]::text\[\]\)/,
  );
  assert.match(
    migration,
    /WHERE rt\.position_code = 'branch_manager'[\s\S]*?'hr:view_employee'/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.can_view_leave_entitlement/,
  );
  assert.match(
    migration,
    /pr\.branch_id = public\.auth_branch_id\(\)[\s\S]*?'hr:approve_leave_request'/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_leave_review_queue\([\s\S]*?requester_profile\.branch_id = p_branch_id[\s\S]*?IN \('cashier', 'chef', 'branch_staff'\)/,
  );
  assert.match(
    migration,
    /OR v_requester_branch IS DISTINCT FROM NEW\.branch_id/,
  );
});

test("retired positions, checklist role column, and notification audiences are removed", () => {
  assert.match(migration, /'archived_staff'/);
  assert.match(
    migration,
    /private\.staff_role_from_position_code\(po\.code\) IS NULL/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.shift_checklist_templates DROP COLUMN IF EXISTS role_code/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.canonicalize_notification\(\)/,
  );
  assert.match(migration, /notification_requires_canonical_target_role/);
  assert.match(
    migration,
    /active_unmapped_position_requires_explicit_reassignment/,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.attendance_records\s+DROP COLUMN IF EXISTS code_verified,\s+DROP COLUMN IF EXISTS check_out_code_verified/,
  );
  assert.match(migration, /legacy_attendance_verification_state_remains/);
  assert.match(migration, /retired_role_literal_remains_in_catalog/);
  assert.match(migration, /legacy_auth_identifier_remains_in_catalog/);
  assert.match(migration, /legacy_route_remains_in_catalog/);
  assert.match(migration, /legacy_notification_payload_remains/);
  assert.match(migration, /retired_policy_name_remains_in_catalog/);
  assert.match(
    migration,
    /'staff_permissions_select_admin',[\s\S]*?'staff_permissions_select_authorized'/,
  );
  assert.match(migration, /archive_legacy_profile_assignment/);
  assert.match(migration, /archive_legacy_role_template/);
  assert.match(migration, /archived_source_template_id/);
  assert.match(migration, /canonical_position_template_count_invalid/);
  assert.match(
    migration,
    /manual_permission_outside_canonical_template_requires_review/,
  );
  assert.match(
    migration,
    /canonical_cross_template_permission_without_owner_audit/,
  );
  assert.match(
    migration,
    /audit_row\.action = 'apply_template'[\s\S]*?audit_row\.source_template_id = sp\.source_template[\s\S]*?actor_position\.code = 'owner'/,
  );
  assert.match(migration, /owner_template_grant_to_non_owner_requires_revoke/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION private\.enforce_staff_permission_boundary/,
  );
  assert.match(migration, /owner_template_cannot_be_applied_to_staff/);
  assert.match(migration, /owner_only_permission_cannot_be_delegated/);
  assert.match(migration, /approval_permission_requires_branch_manager/);
  assert.match(
    migration,
    /ALTER COLUMN is_delegable_to_staff SET DEFAULT false/,
  );
  assert.match(migration, /pk\.is_delegable_to_staff = true/);
  assert.match(migration, /canonical_position_permission_drift_remains/);
});
