import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("approveCountSlip schema and RPC support atomic surplus adjustment", () => {
  const actionsSource = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/actions.ts",
  );
  const migrationSource = readdirSync(join(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readRepoFile(`supabase/migrations/${name}`))
    .join("\n");

  assert.match(
    actionsSource,
    /autoAdjustSurplus:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/,
    "approveCountSlip schema must accept autoAdjustSurplus boolean",
  );
  assert.match(
    actionsSource,
    /surplusReasons/,
    "approveCountSlip must accept surplus reasons dictionary",
  );
  assert.match(
    actionsSource,
    /p_adjust_surplus:\s*parsed\.data\.autoAdjustSurplus/,
    "approveCountSlip must pass p_adjust_surplus to approve_inventory_count_slip_with_waste",
  );
  assert.match(
    migrationSource,
    /p_adjust_surplus boolean DEFAULT false/,
    "approve_inventory_count_slip_with_waste must define p_adjust_surplus parameter",
  );
  assert.match(
    migrationSource,
    /'count_adjustment'/,
    "approve_inventory_count_slip_with_waste must post count_adjustment movements for surplus lines",
  );
});

test("branch and desktop review clients render CountSlipSurplusEvidence and trigger positive adjustments", () => {
  const branchClientSource = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const desktopClientSource = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );
  const surplusEvidenceSource = readRepoFile(
    "apps/web/app/components/inventory/count-slip-surplus-evidence.tsx",
  );

  assert.match(
    branchClientSource,
    /CountSlipSurplusEvidence/,
    "branch client must render CountSlipSurplusEvidence for positive variance",
  );
  assert.match(
    branchClientSource,
    /autoAdjustSurplus/,
    "branch client must dispatch autoAdjustSurplus on approval",
  );
  assert.match(
    desktopClientSource,
    /CountSlipSurplusEvidence/,
    "desktop client must render CountSlipSurplusEvidence for positive variance",
  );
  assert.match(
    desktopClientSource,
    /autoAdjustSurplus/,
    "desktop client must dispatch autoAdjustSurplus on approval",
  );
  assert.match(
    surplusEvidenceSource,
    /SURPLUS_REASONS/,
    "CountSlipSurplusEvidence must define valid surplus reasons",
  );
});

test("inventory messages include Vietnamese labels for count slip surplus flow", () => {
  const messagesSource = readRepoFile("packages/shared/src/messages/inventory.ts");

  assert.match(
    messagesSource,
    /countSlipApprovedWithSurplus/,
    "messages catalog must include countSlipApprovedWithSurplus",
  );
  assert.match(
    messagesSource,
    /countSlipSurplusDetectedTitle/,
    "messages catalog must include countSlipSurplusDetectedTitle",
  );
  assert.match(
    messagesSource,
    /countSlipSurplusEvidenceTitle/,
    "messages catalog must include countSlipSurplusEvidenceTitle",
  );
});
