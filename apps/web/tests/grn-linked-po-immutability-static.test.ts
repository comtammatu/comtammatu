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

test("personal draft queues and discard exclude linked drafts", () => {
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
  const ownerList = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const branchList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );

  assert.match(listDrafts, /\.is\("po_id", null\)/);
  assert.match(discardDraft, /\.is\("po_id", null\)/);
  assert.match(ownerList, /draft\.poId == null/);
  assert.match(branchList, /draft\.poId == null/);
});

test("fully rejected free drafts remain discardable", () => {
  const actions = read("apps/web/app/(protected)/inventory/grn-actions.ts");
  const discardDraft = between(
    actions,
    "export const discardGrnDraft",
    "const updateDraftGrnReceivingSiteSchema",
  );
  const ownerList = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const branchList = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );

  assert.doesNotMatch(
    discardDraft,
    /rejected_quantity|received_quantity|grn_items/,
  );
  assert.match(
    ownerList,
    /if \(draft\.poId == null && draft\.poCount === 0\) \{/,
  );
  assert.match(
    branchList,
    /\{draft\.poId == null && draft\.poCount === 0 \? \(/,
  );
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
  assert.doesNotMatch(
    between(model, "export function grnDraftHref", "type GrnDraftSearchRow"),
    /newGrnSupplierHref|draft\.poId/,
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
  assert.match(ownerCreateRoute, /redirect\("\/inventory\/grn\/new"\)/);
  assert.match(branchCreateRoute, /redirect\(`\/br\/\$\{branchId\}\/stock\/grn\/new`\)/);
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
    /canEditDraft && data\.grn\.status === "draft" && !hasPoLink/,
  );
  assert.match(data, /\.from\("inventory_locations"\)/);
  assert.match(data, /locationName:/);
  assert.match(page, /canEditDraft=\{result\.data\.canEditDraft\}/);
  assert.match(
    page,
    /canManageSupplierInvoice=\{result\.data\.canManageSupplierInvoice\}/,
  );
  assert.match(
    client,
    /const canMutateDraft =\s*canEditDraft && isDraft && grn\.poId == null && grn\.linkedPos\.length === 0;/,
  );
  assert.match(client, /!isDraft && canManageSupplierInvoice/);
  assert.match(client, /const receivingLocationName = grn\.locationName;/);
  assert.doesNotMatch(client, /receivingLocationOptions\.find/);
});

test("Create PO only snapshots clean persisted GRN lines", () => {
  const client = read(
    "apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const handler = between(
    client,
    "function handleCreatePoFromGrn",
    "const draftColumns",
  );
  const buttonStart = client.indexOf("{canCreatePoFromGrn ? (");
  assert.ok(buttonStart >= 0, "Create PO button not found");
  const button = client.slice(buttonStart, buttonStart + 700);

  assert.match(handler, /if \(isSaving \|\| dirtyLines\.length > 0\) \{/);
  assert.match(
    button,
    /disabled=\{\s*isCreatingPo \|\|\s*isSaving \|\|\s*dirtyLines\.length > 0 \|\|\s*lines\.length === 0\s*\}/,
  );
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
