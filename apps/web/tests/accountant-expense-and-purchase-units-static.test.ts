import { test } from "node:test";
import { readSql, assertSqlMatch } from "./_lib/active-sql.ts";

const migration = readSql(process.cwd(), "supabase/migrations/20260731195236_repair_accountant_expense_and_purchase_units.sql");

test("accountants can safely maintain operating expenses and approved POs use receipt units", () => {
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.update_operating_expense\(/,
  );
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.cancel_expense\(/);
  assertSqlMatch(migration,
    /public\.has_position\('accountant'\)[\s\S]*public\.has_permission_any\('finance:view'\)/,
  );
  assertSqlMatch(migration,
    /current_setting\('app\.expense_update_id', true\) IS DISTINCT FROM OLD\.id::text/,
  );
  assertSqlMatch(migration,
    /allocation\.quantity \* request_unit\.to_base_factor \/ receipt_unit\.to_base_factor/,
  );
  assertSqlMatch(migration, /ingredient\.receipt_unit_id/);
  assertSqlMatch(migration, /purchase_demand_receipt_unit_conversion_invalid/);
});
