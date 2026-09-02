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
  const migrationSource = readdirSync(join(repoRoot, "supabase/migration-archive"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readRepoFile(`supabase/migration-archive/${name}`))
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
  assert.match(
    actionsSource,
    /p_photo_urls:\s*parsed\.data\.wastePhotoUrls/,
    "approveCountSlip must pass p_photo_urls to approve_inventory_count_slip_with_waste",
  );
  assert.match(
    actionsSource,
    /p_reasons:\s*parsed\.data\.wasteReasons/,
    "approveCountSlip must pass p_reasons to approve_inventory_count_slip_with_waste",
  );
  assert.match(
    actionsSource,
    /p_allow_self_review:\s*parsed\.data\.allowSelfReview/,
    "approveCountSlip must pass p_allow_self_review to approval RPCs",
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

test("stock_issues_source_type_check allows count_slip_auto_waste and UI displays proper Vietnamese source label", () => {
  const migrationSource = readdirSync(join(repoRoot, "supabase/migration-archive"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readRepoFile(`supabase/migration-archive/${name}`))
    .join("\n");
  const issueDetailSource = readRepoFile(
    "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );
  const messagesSource = readRepoFile(
    "apps/web/lib/messages/inventory.ts",
  );

  assert.match(
    migrationSource,
    /'count_slip_auto_waste'/,
    "migrations must permit 'count_slip_auto_waste' in stock_issues_source_type_check",
  );
  assert.match(
    issueDetailSource,
    /count_slip_auto_waste/,
    "issue detail client must handle count_slip_auto_waste source type",
  );
  assert.match(
    messagesSource,
    /countSlipAutoWasteSource:\s*"Kiểm đếm giao ca"/,
    "messages catalog must include countSlipAutoWasteSource label",
  );
});

test("stock_issue_items_reason_code_check and shared labels support count slip shortage reason codes", () => {
  const migrationSource = readdirSync(join(repoRoot, "supabase/migration-archive"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readRepoFile(`supabase/migration-archive/${name}`))
    .join("\n");
  const labelsSource = readRepoFile("packages/shared/src/labels/vi.ts");
  const actionsSource = readRepoFile(
    "apps/web/app/(protected)/inventory/waste-actions.ts",
  );

  for (const reason of ["discrepancy", "loss", "damaged"]) {
    assert.match(
      migrationSource,
      new RegExp(`'${reason}'::text`),
      `migrations must allow reason_code '${reason}' in stock_issue_items_reason_code_check`,
    );
    assert.match(
      labelsSource,
      new RegExp(`${reason}:`),
      `WASTE_REASON_LABELS_VI must include reason '${reason}'`,
    );
    assert.match(
      actionsSource,
      new RegExp(`"${reason}"`),
      `WASTE_REASON_CODES must include reason '${reason}'`,
    );
  }
});

test("approve_inventory_count_slip_with_waste auto-approves and confirms shortage waste", () => {
  const migrationSource = readdirSync(join(repoRoot, "supabase/migration-archive"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readRepoFile(`supabase/migration-archive/${name}`))
    .join("\n");

  assert.match(
    migrationSource,
    /approval_status\s*=\s*'approved'/,
    "count slip waste approval must directly approve the generated waste issue",
  );
  assert.match(
    migrationSource,
    /execute_post_writeoff_movements/,
    "count slip waste approval must post writeoff stock movements immediately",
  );
});

