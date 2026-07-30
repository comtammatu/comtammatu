import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `${start} not found`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `${end} must follow ${start}`);
  return source.slice(startIndex, endIndex);
}

test("linked PO freezes GRN line and receiving-location mutations", () => {
  const actions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const receivingSite = between(
    actions,
    "export const updateDraftGrnReceivingSite",
    "/* ─── upsertGrnLine",
  );
  const upsertLine = between(
    actions,
    "export const upsertGrnLine",
    "/* ─── confirmGrn",
  );
  const deleteLine = between(
    actions,
    "export const deleteGrnLine",
    "export async function confirmGrn",
  );

  for (const action of [receivingSite, upsertLine, deleteLine]) {
    assert.match(action, /po_id/);
    assert.match(action, /if \(grn\.po_id != null\) \{/);
  }
  assert.match(
    receivingSite,
    /\.eq\("status", "draft"\)\s*\.is\("po_id", null\)/,
  );
});

test("free-draft lookup stays isolated while PO drafts cancel through the RPC", () => {
  const actions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const listDrafts = between(
    actions,
    "export async function listMyGrnDrafts",
    "/* ─── discardGrnDraft",
  );
  const discardDraft = between(
    actions,
    "export const discardGrnDraft",
    "const updateDraftGrnReceivingSiteSchema",
  );
  const branchList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );

  assert.match(listDrafts, /\.is\("po_id", null\)/);
  assert.match(
    actions,
    /reason:\s*z\s*\.string\(\)[\s\S]*?\.trim\(\)[\s\S]*?\.min\(5\)/,
  );
  assert.match(discardDraft, /\.rpc\(\s*"cancel_goods_receipt_note"/);
  assert.match(branchList, /draft\.poId == null/);
});

test("draft cancellation does not infer eligibility from receipt quantities", () => {
  const actions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const discardDraft = between(
    actions,
    "export const discardGrnDraft",
    "const updateDraftGrnReceivingSiteSchema",
  );
  assert.doesNotMatch(
    discardDraft,
    /rejected_quantity|received_quantity|grn_items/,
  );
  assert.match(discardDraft, /draft\.status !== "draft"/);
});

test("existing GRN drafts always resume on canonical DETAIL", () => {
  const model = read("apps/web/lib/inventory/grn-list-model.ts");
  const createData = read("apps/web/lib/inventory/grn-create-data.ts");
  const ownerCreateRoute = read(
    "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
  );
  const branchCreateRoute = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );
  const branchList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );

  assert.match(model, /return `\$\{basePath\}\/\$\{draft\.grnId\}`;/);
  assert.match(
    model,
    /export function grnDraftHref\([\s\S]*?return `\$\{basePath\}\/\$\{draft\.grnId\}`;/,
  );
  assert.match(
    branchList,
    /const href = `\$\{basePath\}\/\$\{draft\.grnId\}`;/,
  );
  assert.doesNotMatch(branchList, /grnSourceSupplierHref/);
  assert.match(
    createData,
    /if \(draftRow\?\.id\) \{\s*redirect\(`\$\{grnBasePath\}\/\$\{draftRow\.id\}`\);\s*\}/,
  );
  assert.doesNotMatch(createData, /fetchGrnDetail|existingDraft/);
  assert.match(ownerCreateRoute, /redirect\("\/inventory\/grn"\)/);
  assert.match(
    branchCreateRoute,
    /redirect\(`\/br\/\$\{branchId\}\/stock\/requests\/new`\)/,
  );
});

test("GRN detail derives mutation and supplier-invoice authority", () => {
  const data = read("apps/web/lib/inventory/grn-detail-data.ts");
  const page = read("apps/web/app/(protected)/inventory/grn/[id]/page.tsx");
  const client = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );

  assert.match(data, /canManageSupplierInvoice: boolean/);
  assert.match(data, /PERMISSION_KEYS\.PROCUREMENT_INVOICE_CREATE/);
  assert.match(
    data,
    /const canEditDraftLines = canEditDraft && data\.grn\.status === "draft"/,
  );
  assert.match(data, /const canEditUnlinkedDraft = canEditDraftLines && !hasPoLink/);
  assert.match(data, /\.from\("inventory_locations"\)/);
  assert.match(data, /locationName:/);
  assert.match(
    page,
    /redirect\(`\/inventory\/grn\?grnId=\$\{encodeURIComponent\(id\)\}&mode=view`\)/,
  );
  assert.match(
    client,
    /const canMutateDraft = canEditDraft && isDraft;/,
  );
  assert.match(
    client,
    /const canChangeLineSet =\s*canMutateDraft && grn\.poId == null && grn\.linkedPos\.length === 0;/,
  );
  assert.match(client, /!isDraft && canManageSupplierInvoice/);
  assert.match(client, /const receivingLocationName = grn\.locationName;/);
  assert.doesNotMatch(client, /receivingLocationOptions\.find/);
});

test("GRN detail cannot create a PO retrospectively", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const newPage = read(
    "apps/web/app/(protected)/inventory/grn/new/page.tsx",
  );
  assert.doesNotMatch(client, /handleCreatePoFromGrn|canCreatePoFromGrn/);
  assert.match(newPage, /redirect\("\/inventory\/grn"\)/);
});

test("confirm delegates approved-PO and physical QC checks to the final RPC", () => {
  const actions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const confirmAction = between(
    actions,
    "export async function confirmGrn",
    "/* ─── amendGrnLine",
  );

  assert.match(confirmAction, /\.rpc\("confirm_goods_receipt_note"/);
  assert.doesNotMatch(confirmAction, /\.from\("supplier_items"\)/);
  assert.doesNotMatch(confirmAction, /supplier_item_mapping_required/);
});

test("retired GRN variance and recreate copy have no runtime exports", () => {
  const labels = read("packages/shared/src/labels/vi.ts");
  const labelExports = read("packages/shared/src/labels/index.ts");
  const inventoryMessages = read("apps/web/lib/messages/inventory.ts");

  for (const retired of [
    "VARIANCE_TIER_HINT_VI",
    "BASELINE_SOURCE_LABELS_VI",
  ]) {
    assert.doesNotMatch(labels, new RegExp(retired));
    assert.doesNotMatch(labelExports, new RegExp(retired));
  }
  assert.doesNotMatch(inventoryMessages, /^\s+recreate:\s*\{/m);
  assert.doesNotMatch(inventoryMessages, /giao đến bếp Chi nhánh/);
});
