import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(`${root}${path}`, "utf8");
}

test("waste form exposes photo upload for DB-enforced photo gates", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );

  assert.match(client, /<WastePhotoUpload/);
  assert.match(client, /applied\.errorCode === INVENTORY_ERROR_CODES\.WASTE_EVIDENCE_REQUIRED/);
  assert.match(client, /setEvidenceRequired\(true\)/);
  assert.doesNotMatch(client, /previewWasteTier|unit_cost|total_cost/);
});
test("waste writeoff RPCs target the current stock_issue_items unit contract", () => {
  const migration = read(
    "supabase/migrations/20260709131500_fix_waste_writeoff_rpc_unit_drop.sql",
  );
  const action = read("apps/web/app/(protected)/inventory/waste-actions.ts");
  const client = read(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );

  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.create_waste_entry/);
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.create_expiry_writeoff/,
  );
  assertSqlNotMatch(migration,
    /INSERT INTO public\.stock_issue_items \([^;]*\bunit\b/s,
  );
  assertSqlMatch(migration, /entry_unit_required/);
  assert.match(action, /item\.entry_unit_id == null/);
  assert.match(client, /!ingredient \|\| !unit \|\| !line\.reasonCode/);
});
test("office waste creation page does not gate behind obsolete feature flags", () => {
  const page = read("apps/web/app/(protected)/inventory/waste/new/page.tsx");
  const flags = read("apps/web/app/(protected)/inventory/_lib/feature-flags.ts");

  assert.doesNotMatch(page, /S11_WASTE_TIER|isFeatureEnabledForBranch/);
  assert.match(page, /<WasteCreateClient/);
  assert.doesNotMatch(flags, /S11_WASTE_TIER|inv_s11_waste_tier/);
});
