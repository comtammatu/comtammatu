import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("approveCountSlip supports autoCreateWaste and links to waste creation", () => {
  const actionsSource = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/actions.ts",
  );

  assert.match(
    actionsSource,
    /autoCreateWaste:\s*z\.boolean\(\)\.optional\(\)\.default\(false\)/,
    "approveCountSlip schema must accept autoCreateWaste boolean",
  );
  assert.match(
    actionsSource,
    /createWasteEntry/,
    "approveCountSlip must integrate with createWasteEntry",
  );
  assert.match(
    actionsSource,
    /wasteCreated/,
    "approveCountSlip result must report wasteCreated",
  );
  assert.match(
    actionsSource,
    /wasteIssueNumber/,
    "approveCountSlip result must report wasteIssueNumber",
  );
});

test("branch and desktop review clients provide seamless 1-touch auto waste on approval", () => {
  const branchClientSource = readRepoFile(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  );
  const desktopClientSource = readRepoFile(
    "apps/web/app/(protected)/inventory/count-slips/count-slips-client.tsx",
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
    /autoCreateWaste/,
    "branch client must pass autoCreateWaste when shortages are approved",
  );
  assert.match(
    branchClientSource,
    /countSlipApprovedWithWaste/,
    "branch client must toast waste creation success",
  );
  assert.match(
    desktopClientSource,
    /autoCreateWaste/,
    "desktop client must pass autoCreateWaste when shortages are approved",
  );
  assert.match(
    desktopClientSource,
    /countSlipApprovedWithWaste/,
    "desktop client must toast waste creation success",
  );
});
