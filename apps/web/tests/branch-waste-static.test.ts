import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch waste is a native touch document workflow isolated from the Admin Dashboard form", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/branch-waste-create-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-waste-create-data.ts");
  const model = read("apps/web/lib/inventory/waste-tier-model.ts");
  const photoUpload = read(
    "apps/web/app/(protected)/inventory/_components/photo-upload-input.tsx",
  );
  const adminDashboardPage = read(
    "apps/web/app/(protected)/inventory/waste/new/page.tsx",
  );
  const adminDashboardClient = read(
    "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );

  assert.match(route, /loadBranchWasteCreateData\(branchId\)/);
  assert.match(route, /<BranchWasteCreateClient/);
  assert.doesNotMatch(route, /WasteNewPageContent|embedded/);

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveInventoryListScope/);
  assert.match(data, /currentUserHasPermission/);
  assert.match(data, /PERMISSION_KEYS\.INVENTORY_WRITEOFF/);
  assert.doesNotMatch(data, /WasteNewPageContent|WasteCreateClient/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /BranchOperatorControlBar/);
  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(client, /<AppDetailFooter[\s\S]*sticky/);
  assert.match(client, /createWasteEntry/);
  assert.match(client, /AntiSplitRollingMeter/);
  assert.match(client, /WastePhotoUpload/);
  assert.match(client, /beforeunload/);
  assert.match(client, /requestRemoveEditorLine/);
  assert.match(client, /overscroll-contain/);
  assert.match(client, /id="branch-waste-photo"/);
  assert.doesNotMatch(
    client,
    /\bWasteCreateClient\b|DocumentFormFrame|DataTable|embedded/,
  );

  assert.match(model, /previewWasteTier/);
  assert.match(model, /WASTE_ALWAYS_TIER_2_REASONS/);
  assert.match(photoUpload, /id\?: string/);
  assert.match(photoUpload, /<input[\s\S]*id=\{id\}/);
  assert.match(adminDashboardPage, /export async function WasteNewPageContent/);
  assert.match(adminDashboardClient, /<DocumentFormFrame/);
  assert.doesNotMatch(
    adminDashboardPage,
    /routeBranchId|embedded|successHref|cancelHref/,
  );
  assert.doesNotMatch(adminDashboardClient, /embedded|successHref|cancelHref/);
});
