import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../../../supabase/migration-archive/20260731195236_repair_accountant_expense_and_purchase_units.sql",
  ),
  "utf8",
);

test("accountants can safely maintain operating expenses and approved POs use receipt units", () => {
  assert.match(
    migration,
    /'public\.update_operating_expense\(bigint,bigint,date,text,jsonb,text,text\)'::regprocedure/,
  );
  assert.match(migration, /'public\.cancel_expense\(bigint\)'::regprocedure/);
  assert.match(
    migration,
    /public\.has_position\('accountant'\)[\s\S]*public\.has_permission_any\('finance:view'\)/,
  );
  assert.match(
    migration,
    /current_setting\('app\.expense_update_id', true\) IS DISTINCT FROM OLD\.id::text/,
  );
  assert.match(migration, /expense_update_evidence_authorization_not_found/);
  assert.match(migration, /expense_cancel_evidence_authorization_not_found/);
  assert.match(
    migration,
    /allocation\.quantity \* request_unit\.to_base_factor \/ receipt_unit\.to_base_factor/,
  );
  assert.match(migration, /ingredient\.receipt_unit_id/);
  assert.match(migration, /purchase_demand_receipt_unit_conversion_invalid/);
});
