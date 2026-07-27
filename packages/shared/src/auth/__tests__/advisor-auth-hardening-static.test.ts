import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const rlsMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migration-archive/20260726013758_optimize_auth_rls_initplans.sql",
  ),
  "utf8",
);
const branchOverrideMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migration-archive/20260726020500_restrict_branch_override_verification.sql",
  ),
  "utf8",
);
const readPerformanceMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migration-archive/20260726023000_optimize_hddt_attendance_reads.sql",
  ),
  "utf8",
);
const menuAvailabilityMigration = readFileSync(
  resolve(
    repoRoot,
    "supabase/migration-archive/20260726030000_optimize_menu_availability_capacity.sql",
  ),
  "utf8",
);

const policyNames = [
  "attendance_consumption_report_lines_select",
  "attendance_consumption_reports_select",
  "profiles_select_authorized",
  "inventory_count_assignments_select",
  "inventory_count_slips_select",
  "leave_requests_select",
] as const;

function extractAlterPolicy(name: (typeof policyNames)[number]): string {
  const match = rlsMigration.match(
    new RegExp(`ALTER POLICY ${name}\\b[\\s\\S]*?\\n\\);`, "i"),
  );
  assert.ok(match, `missing ALTER POLICY ${name}`);
  return match[0];
}

test("Advisor initplan policies evaluate auth.uid once per statement", () => {
  assert.equal(
    [...rlsMigration.matchAll(/\bALTER POLICY\b/g)].length,
    policyNames.length,
  );

  for (const name of policyNames) {
    const policy = extractAlterPolicy(name);
    const authUidCalls = [...policy.matchAll(/auth\.uid\(\)/g)].length;
    const initPlanCalls = [...policy.matchAll(/\(SELECT auth\.uid\(\)\)/g)]
      .length;

    assert.ok(authUidCalls > 0, `${name} must keep its self-access check`);
    assert.equal(
      authUidCalls,
      initPlanCalls,
      `${name} contains a per-row auth.uid() call`,
    );
  }
});

test("Advisor policies evaluate no-argument auth helpers once per statement", () => {
  assert.equal(
    [...rlsMigration.matchAll(/public\.auth_tenant_id\(\)/g)].length,
    [...rlsMigration.matchAll(/\(SELECT public\.auth_tenant_id\(\)\)/g)].length,
  );

  const profiles = extractAlterPolicy("profiles_select_authorized");
  assert.match(profiles, /\(SELECT public\.auth_role\(\)\) = 'owner'/);
  assert.match(profiles, /branch_id = \(SELECT public\.auth_branch_id\(\)\)/);
});

test("policy cleanup preserves the existing Owner, branch, and employee audiences", () => {
  const profiles = extractAlterPolicy("profiles_select_authorized");
  assert.match(profiles, /tenant_id = \(SELECT public\.auth_tenant_id\(\)\)/);
  assert.match(profiles, /\(SELECT public\.auth_role\(\)\) = 'owner'/);
  assert.match(profiles, /branch_id = \(SELECT public\.auth_branch_id\(\)\)/);
  assert.match(profiles, /public\.has_permission\(branch_id, 'staff:view'\)/);

  const reports = extractAlterPolicy("attendance_consumption_reports_select");
  assert.match(reports, /employee\.profile_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(reports, /'hr:approve_checkout'/);
  assert.match(reports, /'inventory:read'/);

  const assignments = extractAlterPolicy("inventory_count_assignments_select");
  assert.match(assignments, /'inventory:count_assign'/);
  assert.match(assignments, /'inventory:count_approve'/);

  const leave = extractAlterPolicy("leave_requests_select");
  assert.match(leave, /public\.has_permission\(NULL, 'hr:view_employee'\)/);
  assert.match(leave, /'hr:approve_leave_request'/);
});

test("redundant self policy is removed without changing grants", () => {
  assert.match(
    rlsMigration,
    /DROP POLICY IF EXISTS profiles_select_self ON public\.profiles/,
  );
  assert.doesNotMatch(rlsMigration, /\b(?:GRANT|REVOKE)\b/);
});

test("unused branch override verification is removed", () => {
  assert.match(
    branchOverrideMigration,
    /DROP FUNCTION IF EXISTS public\.verify_branch_override_code\(BIGINT, TEXT\)/,
  );
  assert.doesNotMatch(
    branchOverrideMigration,
    /GRANT EXECUTE ON FUNCTION public\.verify_branch_override_code/,
  );

  for (const table of [
    "branch_override_codes",
    "branch_override_attempts",
  ] as const) {
    assert.match(
      branchOverrideMigration,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      branchOverrideMigration,
      new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`),
    );
  }

  assert.match(
    branchOverrideMigration,
    /REVOKE ALL ON SEQUENCE public\.branch_override_attempts_id_seq\s+FROM PUBLIC, anon, authenticated/,
  );
});

test("HDDT and attendance hot reads use ordered access and one Owner check", () => {
  assert.match(
    readPerformanceMigration,
    /CREATE INDEX IF NOT EXISTS idx_tax_invoices_tenant_created_id\s+ON public\.tax_invoices \(tenant_id, created_at DESC, id DESC\)/,
  );

  for (const policy of [
    "tax_invoices_select",
    "attendance_select",
    "attendance_checklist_items_select",
  ] as const) {
    const source =
      readPerformanceMigration.match(
        new RegExp(`ALTER POLICY ${policy}\\b[\\s\\S]*?\\n\\);`, "i"),
      )?.[0] ?? "";
    assert.match(
      source,
      /tenant_id = \(SELECT public\.auth_tenant_id\(\)\)/,
      `${policy} must initplan the tenant lookup`,
    );
    assert.match(
      source,
      /\(SELECT public\.auth_is_owner\(\(SELECT auth\.uid\(\)\)\)\)/,
      `${policy} must short-circuit Owner permission checks`,
    );
  }

  const checklistPolicy =
    readPerformanceMigration.match(
      /ALTER POLICY attendance_checklist_items_select\b[\s\S]*?\n\);/i,
    )?.[0] ?? "";
  assert.match(
    checklistPolicy,
    /AND EXISTS \([\s\S]*attendance\.tenant_id = attendance_checklist_items\.tenant_id[\s\S]*auth_is_owner/,
  );

  assert.match(readPerformanceMigration, /'orders:read'/);
  assert.match(readPerformanceMigration, /'hr:approve_checkout'/);
  assert.match(readPerformanceMigration, /'hr:view_employee'/);
  assert.match(readPerformanceMigration, /'staff:manage'/);
});

test("menu availability reuses the set-based stock pool for capacity", () => {
  assert.match(
    menuAvailabilityMigration,
    /END AS stock_capacity,[\s\S]*END AS stock_remaining/,
  );
  assert.match(
    menuAvailabilityMigration,
    /COALESCE\(bs\.on_hand, 0\) \/ NULLIF\(rl\.per_portion_qty, 0\)/,
  );
  assert.match(menuAvailabilityMigration, /branch_stock AS \(/);
  assert.match(
    menuAvailabilityMigration,
    /LEFT JOIN branch_stock bs ON bs\.ingredient_id = rl\.ingredient_id/,
  );
  assert.doesNotMatch(
    menuAvailabilityMigration,
    /LEFT JOIN LATERAL \(\s*SELECT SUM\(sl\.current_quantity\)/,
  );
  assert.match(menuAvailabilityMigration, /sp\.stock_capacity/);
  assert.doesNotMatch(
    menuAvailabilityMigration,
    /SELECT public\.compute_menu_item_stock_capacity/,
  );
  assert.match(menuAvailabilityMigration, /il\.location_kind = 'warehouse'/);
  assert.match(
    menuAvailabilityMigration,
    /WHEN r\.stock_capacity IS NULL THEN NULL::integer/,
  );
  assert.match(
    menuAvailabilityMigration,
    /REVOKE ALL ON FUNCTION public\.branch_menu_limit_availability\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    menuAvailabilityMigration,
    /GRANT EXECUTE ON FUNCTION public\.branch_menu_limit_availability\([\s\S]*?\) TO service_role;/,
  );
});
