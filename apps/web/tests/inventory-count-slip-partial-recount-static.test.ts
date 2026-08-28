import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function readAllMigrations() {
  return readdirSync(join(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readRepoFile(`supabase/migrations/${name}`))
    .join("\n");
}

test("partial recount RPCs preserve the count snapshot and blind-read boundary", () => {
  const migrations = readAllMigrations();

  assert.match(
    migrations,
    /recount_round\s+integer\s+NOT NULL\s+DEFAULT 0/i,
  );
  assert.match(
    migrations,
    /recount_required\s+boolean\s+NOT NULL\s+DEFAULT false/i,
  );
  assert.match(
    migrations,
    /FUNCTION public\.request_inventory_count_line_recount\(/,
  );
  assert.match(
    migrations,
    /FUNCTION public\.get_my_count_slip_recount\(/,
  );
  assert.match(
    migrations,
    /FUNCTION public\.resubmit_inventory_count_slip_lines\(/,
  );
  assert.match(
    migrations,
    /recount_payload_set_mismatch/,
    "resubmit must reject missing or extra line ids",
  );
  assert.match(
    migrations,
    /already_resubmitted/,
    "resubmit must be idempotent for a completed round",
  );

  const blindFunction = migrations.slice(
    migrations.lastIndexOf(
      "CREATE OR REPLACE FUNCTION public.get_my_count_slip_recount",
    ),
    migrations.lastIndexOf(
      "CREATE OR REPLACE FUNCTION public.resubmit_inventory_count_slip_lines",
    ),
  );
  assert.doesNotMatch(blindFunction, /system_quantity|variance/);
});

test("review and employee clients exchange selected line ids and recount round", () => {
  const actions = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/actions.ts",
  );
  const ownerClient = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );
  const branchClient = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const staffActions = readRepoFile(
    "apps/web/lib/staff-runtime/count/actions.ts",
  );
  const staffPage = readRepoFile(
    "apps/web/lib/staff-runtime/count/page.tsx",
  );

  assert.match(actions, /lineIds:\s*z\s*\.array/);
  assert.match(actions, /request_inventory_count_line_recount/);
  assert.match(ownerClient, /lineIds/);
  assert.match(branchClient, /lineIds/);
  assert.match(staffActions, /resubmit_inventory_count_slip_lines/);
  assert.match(staffActions, /recountRound/);
  assert.match(staffPage, /get_my_count_slip_recount/);
});

test("manual writeoff surfaces require one photo for every submitted line", () => {
  const action = readRepoFile(
    "apps/web/app/(protected)/inventory/waste-actions.ts",
  );
  const ownerForm = readRepoFile(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );
  const branchForm = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/branch-waste-create-client.tsx",
  );

  assert.match(
    action,
    /photo_urls:\s*z\s*\.array\(z\.string\(\)\.url\(\)\)\s*\.min\(1,[^)]+\)\s*\.max\(10\)/s,
  );
  assert.match(ownerForm, /line\.photoUrls\.length === 0/);
  assert.match(branchForm, /line\.photoUrls\.length === 0/);
  assert.doesNotMatch(ownerForm, /evidenceRequired\s*&&\s*line\.photoUrls/);
  assert.doesNotMatch(branchForm, /evidenceRequired\s*&&\s*line\.photoUrls/);
});
