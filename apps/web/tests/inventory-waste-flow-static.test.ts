import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

function readPgDumpObject(source: string, createPrefix: string): string {
  const start = source.indexOf(createPrefix);
  assert.notEqual(start, -1, `missing pg_dump object: ${createPrefix}`);
  const end = source.indexOf("\n\n--\n-- Name:", start + createPrefix.length);
  assert.notEqual(end, -1, `unterminated pg_dump object: ${createPrefix}`);
  return source.slice(start, end);
}

test("waste form exposes photo upload for DB-enforced photo gates", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );
  const meter = read(
    "apps/web/app/(protected)/inventory/_components/anti-split-rolling-meter.tsx",
  );
  const tierModel = read("apps/web/lib/inventory/waste-tier-model.ts");

  assert.match(tierModel, /quantityRatio >= 0\.5/);
  assert.match(tierModel, /projectedRollingSum >= TIER_1_VALUE/);
  assert.match(client, /previewWasteTier\(/);
  assert.match(client, /revealPhotoUploadForCurrentLines\(\)/);
  assert.match(client, /includes\("bằng chứng"\).*includes\("ảnh"\)/s);
  assert.match(meter, /onStatusChangeRef/);
  assert.match(meter, /\.catch\(\(\) => \{/);
});

test("waste writeoff RPCs target the current stock_issue_items unit contract", () => {
  const prodBaseline = read(
    "supabase/migrations/00000000000000_baseline.sql",
  );
  const createWasteEntryRpc = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.create_waste_entry(",
  );
  const createExpiryWriteoffRpc = readPgDumpObject(
    prodBaseline,
    "CREATE FUNCTION public.create_expiry_writeoff(",
  );
  const wasteWriteoffRpcs = `${createWasteEntryRpc}\n${createExpiryWriteoffRpc}`;
  const action = read("apps/web/app/(protected)/inventory/waste-actions.ts");
  const client = read(
    "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );

  assert.match(createWasteEntryRpc, /CREATE FUNCTION public\.create_waste_entry/);
  assert.match(
    createExpiryWriteoffRpc,
    /CREATE FUNCTION public\.create_expiry_writeoff/,
  );
  assert.doesNotMatch(
    wasteWriteoffRpcs,
    /INSERT INTO public\.stock_issue_items \([^;]*\bunit\b/s,
  );
  assert.match(wasteWriteoffRpcs, /entry_unit_required/);
  assert.match(action, /item\.entry_unit_id == null/);
  assert.match(client, /if \(!issueUnit\)/);
});
