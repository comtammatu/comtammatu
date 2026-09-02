import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const slipsClient =
  "app/(protected)/inventory/count-slips/count-slips-client.tsx";
const slipsPage = "app/(protected)/inventory/count-slips/page.tsx";
const assignmentsClient =
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx";
const assignmentsPage = "app/(protected)/inventory/count-assignments/page.tsx";

test("Wave 3 count slips D1 binds addressable ?slipId= on page + client", () => {
  const page = read(slipsPage);
  const client = read(slipsClient);

  assert.match(page, /slipId\?:/);
  assert.match(page, /initialSlipId/);
  assert.match(page, /parsePositiveId\(params\.slipId\)/);
  assert.match(page, /<CountSlipsClient[\s\S]*initialSlipId=/);

  assert.match(client, /useSearchParams/);
  assert.match(client, /searchParams\.get\("slipId"\)/);
  assert.match(client, /replaceSlipId/);
  assert.match(client, /router\.replace/);
  assert.match(client, /function openSlip|const openSlip/);
  assert.match(client, /function closeSlip|const closeSlip/);
  assert.match(client, /next\.delete\("slipId"\)/);
  assert.match(client, /next\.set\("slipId"/);

  assert.doesNotMatch(client, /from "@comtammatu\/ui\/components\/drawer"/);
  assert.doesNotMatch(client, /<Drawer/);
  assert.doesNotMatch(client, /useLongPress/);
});

test("Wave 3 count assignments D1 binds addressable ?assignmentId= on page + client", () => {
  const page = read(assignmentsPage);
  const client = read(assignmentsClient);

  assert.match(page, /assignmentId\?:/);
  assert.match(page, /initialAssignmentId/);
  assert.match(page, /parsePositiveId\(params\.assignmentId\)/);
  assert.match(page, /<CountAssignmentsClient[\s\S]*initialAssignmentId=/);

  assert.match(client, /useSearchParams/);
  assert.match(client, /searchParams\.get\("assignmentId"\)/);
  assert.match(client, /replaceAssignmentId/);
  assert.match(client, /router\.replace/);
  assert.match(client, /function openEditor/);
  assert.match(client, /function closeEditor/);
  assert.match(client, /next\.delete\("assignmentId"\)/);
  assert.match(client, /next\.set\("assignmentId"/);
  assert.match(client, /buildShiftScopeHref\([\s\S]*assignmentId:/);

  // URL sync must not depend on selectionByEmployee (draft reset / loop risk).
  assert.doesNotMatch(
    client,
    /searchParams\.get\("assignmentId"\)[\s\S]{0,800}\[employees,\s*searchParams,\s*selectionByEmployee\]/,
  );

  assert.doesNotMatch(client, /from "@comtammatu\/ui\/components\/drawer"/);
  assert.doesNotMatch(client, /<Drawer/);
  assert.doesNotMatch(client, /useLongPress/);
});

test("Wave 3 waste uses addressable D1 approval review and dedicated D3 create", () => {
  const approvals = read(
    "app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );
  const create = read(
    "app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );

  assert.match(approvals, /useDocumentOverlayUrl/);
  assert.match(approvals, /WASTE_APPROVAL_OVERLAY_KEYS = \["wasteIssueId"\]/);
  assert.match(approvals, /overlay\.get\("wasteIssueId"\)/);
  assert.match(approvals, /overlay\.patchOverlay\(\{ wasteIssueId:/);
  assert.match(approvals, /overlay\.clearOverlay\(\)/);
  assert.doesNotMatch(approvals, /from "@comtammatu\/ui\/components\/drawer"/);
  assert.doesNotMatch(create, /useSearchParams/);
  assert.doesNotMatch(create, /\?wasteId=/);
});
