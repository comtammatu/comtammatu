import { resolve } from "node:path";
import test from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "../../test-utils/active-sql";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const rlsMigration = readSql(repoRoot, "supabase/migrations/20260726013758_optimize_auth_rls_initplans.sql");
const readPerformanceMigration = readSql(repoRoot, "supabase/migrations/20260726023000_optimize_hddt_attendance_reads.sql");
const menuAvailabilityMigration = readSql(repoRoot, "supabase/migrations/20260726030000_optimize_menu_availability_capacity.sql");

const policyNames = [
  "attendance_consumption_report_lines_select",
  "attendance_consumption_reports_select",
  "profiles_select_authorized",
  "inventory_count_assignments_select",
  "inventory_count_slips_select",
  "leave_requests_select",
] as const;

test("Advisor initplan policies evaluate auth.uid once per statement", () => {
  for (const name of policyNames) {
    assertSqlMatch(rlsMigration, new RegExp(`CREATE POLICY ${name}\\b`));
  }
});

test("Advisor policies evaluate no-argument auth helpers once per statement", () => {
  assertSqlMatch(rlsMigration, /CREATE POLICY profiles_select_authorized/);
});

test("policy cleanup preserves the existing Owner, branch, and employee audiences", () => {
  assertSqlMatch(rlsMigration, /CREATE POLICY profiles_select_authorized/);
  assertSqlMatch(
    rlsMigration,
    /CREATE POLICY attendance_consumption_reports_select/,
  );
  assertSqlMatch(
    rlsMigration,
    /CREATE POLICY inventory_count_assignments_select/,
  );
  assertSqlMatch(rlsMigration, /CREATE POLICY leave_requests_select/);
});

test("redundant self policy is removed without changing grants", () => {
  assertSqlMatch(rlsMigration,
    /DROP POLICY IF EXISTS profiles_select_self ON public\.profiles/,
  );
  assertSqlNotMatch(rlsMigration, /\b(?:GRANT|REVOKE)\b/);
});

test("HDDT and attendance hot reads use ordered access and one Owner check", () => {
  assertSqlMatch(readPerformanceMigration,
    /CREATE INDEX IF NOT EXISTS idx_tax_invoices_tenant_created_id\s+ON public\.tax_invoices \(tenant_id, created_at DESC, id DESC\)/,
  );

  for (const policy of [
    "tax_invoices_select",
    "attendance_select",
    "attendance_checklist_items_select",
  ] as const) {
    const source = readPerformanceMigration;
    assertSqlMatch(source,
      /tenant_id = \(SELECT public\.auth_tenant_id\(\)\)/,
      `${policy} must initplan the tenant lookup`,
    );
    assertSqlMatch(source,
      /\(SELECT public\.auth_is_owner\(\(SELECT auth\.uid\(\)\)\)\)/,
      `${policy} must short-circuit Owner permission checks`,
    );
  }

  assertSqlMatch(
    readPerformanceMigration,
    /AND EXISTS \([\s\S]*attendance\.tenant_id = attendance_checklist_items\.tenant_id[\s\S]*auth_is_owner/,
  );

  assertSqlMatch(readPerformanceMigration, /'orders:read'/);
  assertSqlMatch(readPerformanceMigration, /'hr:approve_checkout'/);
  assertSqlMatch(readPerformanceMigration, /'hr:view_employee'/);
  assertSqlMatch(readPerformanceMigration, /'staff:manage'/);
});

test("menu availability reuses the set-based stock pool for capacity", () => {
  assertSqlMatch(menuAvailabilityMigration,
    /END AS stock_capacity,[\s\S]*END AS stock_remaining/,
  );
  assertSqlMatch(menuAvailabilityMigration,
    /COALESCE\(bs\.on_hand, 0\) \/ NULLIF\(rl\.per_portion_qty, 0\)/,
  );
  assertSqlMatch(menuAvailabilityMigration, /branch_stock AS \(/);
  assertSqlMatch(menuAvailabilityMigration,
    /LEFT JOIN branch_stock bs ON bs\.ingredient_id = rl\.ingredient_id/,
  );
  assertSqlNotMatch(menuAvailabilityMigration,
    /LEFT JOIN LATERAL \(\s*SELECT SUM\(sl\.current_quantity\)/,
  );
  assertSqlMatch(menuAvailabilityMigration, /sp\.stock_capacity/);
  assertSqlNotMatch(menuAvailabilityMigration,
    /SELECT public\.compute_menu_item_stock_capacity/,
  );
  assertSqlMatch(menuAvailabilityMigration, /il\.location_kind = 'warehouse'/);
  assertSqlMatch(menuAvailabilityMigration,
    /WHEN r\.stock_capacity IS NULL THEN NULL::integer/,
  );
  assertSqlMatch(menuAvailabilityMigration,
    /REVOKE ALL ON FUNCTION public\.branch_menu_limit_availability\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
  );
  assertSqlMatch(menuAvailabilityMigration,
    /GRANT EXECUTE ON FUNCTION public\.branch_menu_limit_availability\([\s\S]*?\) TO service_role;/,
  );
});
