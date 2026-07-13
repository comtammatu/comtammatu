import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch waste is a native touch document workflow with an isolated Admin Dashboard form", () => {
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
  const wastePhotoUpload = read(
    "apps/web/app/(protected)/inventory/_components/waste-photo-upload.tsx",
  );
  const storageMigration = read(
    "supabase/migrations/20260712130942_fix_branch_stocktake_and_waste_upload_auth.sql",
  );
  const officePage = read(
    "apps/web/app/(protected)/inventory/waste/new/page.tsx",
  );
  const officeClient = read(
    "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );

  assert.match(route, /loadBranchWasteCreateData\(branchId\)/);
  assert.match(route, /<BranchWasteCreateClient/);
  assert.match(route, /getSafeInternalReturnTo\(rawReturnTo\)/);
  assert.match(
    route,
    /safeReturnTo === stockBasePath \|\|\s*safeReturnTo\?\.startsWith\(`\$\{stockBasePath\}\?`\)/,
  );
  assert.match(route, /<BranchWasteCreateClient \{\.\.\.data\} backHref=\{backHref\}/);
  assert.doesNotMatch(route, /WasteNewPageContent|embedded/);

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveInventoryListScope/);
  assert.match(data, /currentUserHasPermission/);
  assert.match(data, /PERMISSION_KEYS\.INVENTORY_WRITEOFF/);
  assert.doesNotMatch(data, /WasteNewPageContent|WasteCreateClient/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /router\.push\(backHref\)/);
  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(client, /<AppDetailFooter[\s\S]*sticky/);
  assert.match(client, /createWasteEntry/);
  assert.match(client, /AntiSplitRollingMeter/);
  assert.match(client, /WastePhotoUpload/);
  assert.match(client, /beforeunload/);
  assert.match(
    client,
    /async function requestLeave\([\s\S]*?if \(hasDraftChanges\)[\s\S]*?const confirmed = await confirm\([\s\S]*?if \(!confirmed\) return;[\s\S]*?router\.push\(targetHref\)/,
  );
  assert.match(client, /requestRemoveEditorLine/);
  assert.match(client, /overscroll-contain/);
  assert.match(client, /id="branch-waste-photo"/);
  assert.match(client, /branchId=\{branchId\}/);
  assert.doesNotMatch(
    client,
    /\bWasteCreateClient\b|DocumentFormFrame|DataTable|embedded/,
  );

  assert.match(model, /previewWasteTier/);
  assert.match(model, /WASTE_ALWAYS_TIER_2_REASONS/);
  assert.match(photoUpload, /id\?: string/);
  assert.match(photoUpload, /<input[\s\S]*id=\{id\}/);
  assert.match(photoUpload, /INVENTORY_VI\.uploadFailed/);
  assert.doesNotMatch(photoUpload, /toast\.error\(upErr\.message\)/);
  assert.match(wastePhotoUpload, /folder=\{`waste\/\$\{branchId\}\/\$\{issueId\}`\}/);
  assert.match(
    storageMigration,
    /has_permission\([\s\S]*\(storage\.foldername\(name\)\)\[3\][\s\S]*'inventory:writeoff'/,
  );
  assert.match(storageMigration, /'image\/heif'/);
  assert.match(officePage, /export async function WasteNewPageContent/);
  assert.doesNotMatch(officePage, /S11_WASTE_TIER|inv_s11_waste_tier/);
  assert.match(officeClient, /<DocumentFormFrame/);
  assert.doesNotMatch(
    officePage,
    /routeBranchId|embedded|successHref|cancelHref/,
  );
  assert.doesNotMatch(officeClient, /embedded|successHref|cancelHref/);
});
