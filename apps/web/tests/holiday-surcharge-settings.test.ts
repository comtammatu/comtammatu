import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { holidaySurchargeFormSchema } from "../app/(protected)/settings/(tenant)/holiday-surcharges/schema";

function readApp(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

const migration = readRepo(
  "supabase/migrations/20260831234001_add_holiday_surcharge_policies.sql",
);

test("holiday surcharge policies are tenant-secured and reject same-scope overlaps", () => {
  assert.match(migration, /CREATE TABLE public\.holiday_surcharge_policies/);
  assert.match(
    migration,
    /ALTER TABLE public\.holiday_surcharge_policies ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.holiday_surcharge_policies[\s\S]*authenticated/,
  );
  assert.match(migration, /public\.auth_is_owner\(v_uid\)/);
  assert.match(migration, /public\.has_permission_any\('settings:tenant'\)/);
  assert.match(migration, /p\.branch_id IS NOT DISTINCT FROM NEW\.branch_id/);
  assert.match(migration, /tstzrange\(p\.starts_at, p\.ends_at, '\[\)'\)/);
  assert.match(migration, /holiday_surcharge_policy_overlap/);
});

test("orders snapshot automatic policy and recalculate percentage after discounts", () => {
  assert.match(migration, /ADD COLUMN holiday_surcharge_policy_id/);
  assert.match(migration, /ADD COLUMN holiday_surcharge_source/);
  assert.match(
    migration,
    /ORDER BY \(p\.branch_id IS NOT NULL\) DESC, p\.starts_at DESC/,
  );
  assert.match(
    migration,
    /NEW\.holiday_surcharge_policy_name := v_policy\.name/,
  );
  assert.match(
    migration,
    /v_surcharge_base := GREATEST\([\s\S]*NEW\.subtotal[\s\S]*NEW\.discount_amount/,
  );
  assert.match(
    migration,
    /v_surcharge_base \* NEW\.holiday_surcharge_value \/ 100/,
  );
  assert.match(
    migration,
    /WHEN v_amount = 0 THEN 'waived'[\s\S]*ELSE 'manual'/,
  );
  assert.match(migration, /service_charge_payment_pending/);
  assert.match(migration, /payment_code_locked/);
});

test("owner settings exposes schedule, formula, scope, and server-validated actions", () => {
  const page = readApp(
    "app/(protected)/settings/(tenant)/holiday-surcharges/page.tsx",
  );
  const client = readApp(
    "app/(protected)/settings/(tenant)/holiday-surcharges/holiday-surcharges-client.tsx",
  );
  const actions = readApp(
    "app/(protected)/settings/(tenant)/holiday-surcharges/actions.ts",
  );

  assert.match(page, /get_holiday_surcharge_policies/);
  assert.match(page, /holidaySurchargePoliciesSchema\.safeParse/);
  assert.match(client, /branch_scope/);
  assert.match(client, /calculation_type/);
  assert.match(client, /type="datetime-local"/);
  assert.match(client, /percentageHelp/);
  assert.match(actions, /holidaySurchargeFormSchema\.safeParse/);
  assert.match(actions, /PERMISSION_KEYS\.SETTINGS_TENANT/);
  assert.match(actions, /upsert_holiday_surcharge_policy/);
  assert.doesNotMatch(actions, /error\.message/);
});

test("holiday surcharge form validates formula limits and Vietnam-local intervals", () => {
  const valid = {
    name: "Tết Nguyên Đán 2027",
    branch_scope: "tenant",
    calculation_type: "percentage" as const,
    value: "10.5",
    starts_at_local: "2027-02-05T00:00",
    ends_at_local: "2027-02-12T00:00",
    is_active: "true" as const,
  };

  assert.equal(holidaySurchargeFormSchema.safeParse(valid).success, true);
  assert.equal(
    holidaySurchargeFormSchema.safeParse({ ...valid, value: "100.01" }).success,
    false,
  );
  assert.equal(
    holidaySurchargeFormSchema.safeParse({
      ...valid,
      calculation_type: "fixed",
      value: "10000.5",
    }).success,
    false,
  );
  assert.equal(
    holidaySurchargeFormSchema.safeParse({
      ...valid,
      starts_at_local: "2027-02-30T00:00",
    }).success,
    false,
  );
  assert.equal(
    holidaySurchargeFormSchema.safeParse({
      ...valid,
      ends_at_local: valid.starts_at_local,
    }).success,
    false,
  );
});
