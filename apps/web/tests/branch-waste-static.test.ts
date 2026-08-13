import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch waste is a native touch document workflow with an isolated Owner surface form", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/branch-waste-create-client.tsx",
  );
  const data = read("apps/web/lib/inventory/branch-waste-create-data.ts");
  const form = read(
    "apps/web/app/(protected)/inventory/waste/waste-operational-form.tsx",
  );
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");
  const photoUpload = read(
    "apps/web/app/components/form/photo-upload-input.tsx",
  );
  const officePage = read(
    "apps/web/app/(protected)/inventory/waste/new/page.tsx",
  );
  const officeClient = read(
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
  assert.match(client, /BranchOperatorPanel/);
  assert.match(client, /WasteLineSheet/);
  assert.match(client, /ItemGroup/);
  assert.match(client, /AppDetailFooter/);
  assert.match(client, /createWasteEntry/);
  assert.match(client, /const cancelHref = stockBasePath/);
  assert.match(client, /href=\{cancelHref\}/);
  assert.doesNotMatch(client, /WasteOperationalForm/);
  assert.doesNotMatch(
    client,
    /\bWasteCreateClient\b|DocumentFormFrame|DataTable|embedded/,
  );
  assert.doesNotMatch(
    client,
    /unitCost|totalValue|formatVND|priceVariance|branchCap|shiftCap/,
  );

  const lineSheet = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste/_components/waste-line-sheet.tsx",
  );
  assert.match(lineSheet, /<AppSheet/);
  assert.match(lineSheet, /NumberPadSheet/);
  assert.match(lineSheet, /PhotoUploadInput/);
  assert.match(lineSheet, /size="touch"/);
  assert.doesNotMatch(
    lineSheet,
    /from ["']@\/\(protected\)\/inventory\/(?!waste-actions)/,
  );
  assert.doesNotMatch(
    lineSheet,
    /unitCost|totalValue|formatVND|DocumentFormFrame|DataTable/,
  );

  assert.match(form, /createWasteEntry/);
  assert.match(form, /WastePhotoUpload/);
  assert.match(form, /copy\.priceReviewHint/);
  assert.match(form, /showLocationPicker = context\.locations\.length > 1/);
  assert.match(inventoryMessages, /Cần Kế toán kiểm tra giá/);
  assert.match(inventoryMessages, /noLocationAvailable:/);
  assert.doesNotMatch(
    form,
    /unitCost|totalValue|formatVND|priceVariance|branchCap|shiftCap/,
  );
  assert.match(photoUpload, /id\?: string/);
  assert.match(photoUpload, /<input[\s\S]*id=\{id\}/);
  assert.match(officePage, /export async function WasteNewPageContent/);
  assert.match(officeClient, /<DocumentFormFrame/);
  assert.doesNotMatch(
    officePage,
    /routeBranchId|embedded|successHref|cancelHref/,
  );
  assert.doesNotMatch(officeClient, /embedded|successHref/);
  assert.match(
    officeClient,
    /cancelHref=\{`\/inventory\/consumption\?view=waste&branch=\$\{context\.branch\.id\}`\}/,
  );
});
