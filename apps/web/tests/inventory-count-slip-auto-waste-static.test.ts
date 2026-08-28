import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("approveCountSlip keeps count approval and auto waste in one database transaction", () => {
  const actionsSource = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/actions.ts",
  );
  const migrationSource = readdirSync(join(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readRepoFile(`supabase/migrations/${name}`))
    .join("\n");

  assert.match(
    actionsSource,
    /autoCreateWaste:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/,
    "approveCountSlip schema must accept autoCreateWaste boolean",
  );
  assert.match(
    actionsSource,
    /wastePhotoUrls/,
    "approveCountSlip must accept per-line shortage evidence",
  );
  assert.match(
    actionsSource,
    /approve_inventory_count_slip_with_waste/,
    "approveCountSlip must use the atomic approval + waste RPC",
  );
  assert.doesNotMatch(
    actionsSource,
    /createWasteEntry/,
    "approveCountSlip must not commit approval and waste through separate RPCs",
  );
  assert.match(
    migrationSource,
    /CREATE OR REPLACE FUNCTION public\.approve_inventory_count_slip_with_waste/,
    "the database must own the atomic approval + waste boundary",
  );
});

test("branch and desktop review clients provide seamless 1-touch auto waste on approval", () => {
  const branchClientSource = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const desktopClientSource = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );
  const evidenceSource = readRepoFile(
    "apps/web/app/components/inventory/count-slip-waste-evidence.tsx",
  );

  // Bulky callout removed
  assert.doesNotMatch(
    branchClientSource,
    /varianceActionsTitle/,
    "branch count slip client must not render bulky variance actions box",
  );
  assert.doesNotMatch(
    desktopClientSource,
    /varianceActionsTitle/,
    "desktop count slip client must not render bulky variance actions box",
  );

  // 1-touch auto waste confirmation wired
  assert.match(
    branchClientSource,
    /CountSlipWasteEvidence/,
    "branch client must render shortage evidence before auto waste",
  );
  assert.match(
    branchClientSource,
    /countSlipApprovedWithWaste/,
    "branch client must toast waste creation success",
  );
  assert.match(
    desktopClientSource,
    /CountSlipWasteEvidence/,
    "desktop client must render shortage evidence before auto waste",
  );
  assert.match(
    desktopClientSource,
    /countSlipApprovedWithWaste/,
    "desktop client must toast waste creation success",
  );
  assert.match(
    evidenceSource,
    /PhotoUploadInput/,
    "the shared shortage evidence surface must collect a photo per line",
  );
});
