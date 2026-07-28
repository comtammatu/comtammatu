import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

test("waste form exposes photo upload for DB-enforced photo gates", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );

  assert.match(client, /<WastePhotoUpload/);
  assert.match(client, /result\.errorCode === "waste_evidence_required"/);
  assert.match(client, /setEvidenceRequired\(true\)/);
  assert.doesNotMatch(client, /previewWasteTier|unit_cost|total_cost/);
});

test("waste writeoff RPCs target the current stock_issue_items unit contract", () => {
  const migration = read(
    "supabase/migration-archive/20260709131500_fix_waste_writeoff_rpc_unit_drop.sql",
  );
  const action = read("apps/web/app/(protected)/inventory/waste-actions.ts");
  const client = read(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_waste_entry/);
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_expiry_writeoff/,
  );
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.stock_issue_items \([^;]*\bunit\b/s,
  );
  assert.match(migration, /entry_unit_required/);
  assert.match(action, /item\.entry_unit_id == null/);
  assert.match(client, /!ingredient \|\| !unit \|\| !line\.reasonCode/);
});
