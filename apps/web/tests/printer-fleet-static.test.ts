import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("printer fleet UI drops 3-slot role grid", () => {
  const client = read(
    "apps/web/app/(protected)/br/_shared/settings/printers/printers-client.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/br/_shared/settings/printers/actions.ts",
  );

  assert.doesNotMatch(client, /ROLE_ORDER/);
  assert.doesNotMatch(client, /Vị trí máy in/);
  assert.doesNotMatch(client, /kitchen_1|kitchen_2/);
  assert.match(client, /Thêm máy in/);
  assert.match(client, /showsCategoryRoutes/);
  assert.match(client, /testPrintPrinter/);
  assert.match(client, /PRINTER_COPY\.testPrint/);
  assert.match(actions, /export async function testPrintPrinter/);
  assert.match(actions, /job_type: "provisional_bill"/);
  assert.match(actions, /SAMPLE_PAYLOADS\.provisional_bill/);
  assert.match(actions, /idempotency_key: `printer-test:\$\{printer\.id\}:\$\{Date\.now\(\)\}`/);
  assert.doesNotMatch(actions, /resolveTestPrintTypes/);
  assert.doesNotMatch(actions, /SAFE_TEST_PRINT_TYPES/);
  assert.doesNotMatch(actions, /z\.enum\(\["receipt", "kitchen_1", "kitchen_2"\]\)/);
});

test("template test print picks printer via print_types routing", () => {
  const actions = read(
    "apps/web/app/(protected)/settings/printers/templates/actions.ts",
  );

  assert.match(actions, /from\("printer_print_types"\)/);
  assert.match(actions, /\.eq\("print_type", kind\)/);
  assert.doesNotMatch(actions, /preferredRole/);
  assert.doesNotMatch(actions, /kitchen_1/);
});

test("printer fleet migration widens schema and sort_order routing", () => {
  const migration = read(
    "supabase/migration-archive/20260729140600_printer_fleet_sort_order.sql",
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS sort_order/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS printers_role_check/);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS printers_branch_id_role_tenant_id_key/,
  );
  assert.match(migration, /printers_tenant_branch_name_key/);
  assert.match(migration, /ORDER BY p\.sort_order, p\.id/);
  assert.match(migration, /v_role := COALESCE/);
  assert.doesNotMatch(migration, /invalid printer role/);
});

test("settings copy no longer advertises fixed 3-printer topology", () => {
  const settings = read("apps/web/lib/messages/settings.ts");

  assert.doesNotMatch(settings, /3 máy in/);
  assert.doesNotMatch(settings, /bếp 1, bếp 2/);
});

test("print-agent accepts free-form printer role labels", () => {
  const dispatch = read("apps/print-agent/src/dispatch.ts");

  assert.match(dispatch, /role: string;/);
  assert.doesNotMatch(dispatch, /"kitchen_1"/);
});
