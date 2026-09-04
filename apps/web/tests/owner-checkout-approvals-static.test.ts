import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const cwd = process.cwd();
const repoRoot =
  cwd.endsWith("apps/web") || cwd.endsWith("apps\\web")
    ? path.resolve(cwd, "../..")
    : cwd;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("owner checkout approvals route is a native Control Surface LIST", () => {
  const pageSource = read(
    "apps/web/app/(protected)/hr/attendance/checkout-approvals/page.tsx",
  );
  const clientSource = read(
    "apps/web/app/(protected)/hr/attendance/checkout-approvals/checkout-approvals-list-client.tsx",
  );
  const censusSource = read("scripts/page-archetypes.mjs");

  // Page wrapper: Owner HR list width tier pin is width="xwide"
  assert.match(pageSource, /<AppPage\s+width="xwide"/);
  assert.doesNotMatch(pageSource, /StaffCheckoutApprovalsPageContent/);
  assert.match(pageSource, /loadCheckoutReviewQueue/);

  // Client presenter: AppListFrame + DataTable with 1024 cutover
  assert.match(clientSource, /<AppListFrame/);
  assert.match(clientSource, /<DataTable/);
  assert.match(clientSource, /mobileBreakpoint=\{1024\}/);
  assert.match(clientSource, /mobileCardRender=/);
  assert.match(clientSource, /renderRowContextMenu=/);
  assert.match(clientSource, /RowActionsMenu/);

  // Owner plane uses Dialog, never AppSheet
  assert.match(clientSource, /<AppDialog/);
  assert.doesNotMatch(clientSource, /AppSheet/);
  assert.doesNotMatch(clientSource, /AppDrawer/);

  // Mutations: approve and reject actions wired
  assert.match(clientSource, /approveCheckoutRequest/);
  assert.match(clientSource, /rejectCheckoutRequest/);

  // Census mapping
  assert.match(
    censusSource,
    /"apps\/web\/app\/\(protected\)\/hr\/attendance\/checkout-approvals\/page\.tsx":\s*"LIST"/,
  );
  assert.doesNotMatch(censusSource, /"EMBED-WRAPPER"/);
});
