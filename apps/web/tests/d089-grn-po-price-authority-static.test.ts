import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * D089 — purchase-price authority at PO; warehouse GRN draft has no price entry.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("D089 decision documents Option B PO→GRN unit_cost sync on approve", () => {
  const decisions = readRepo("docs/plan/decisions.md");
  assert.match(decisions, /## D089: Purchase-price authority at PO/);
  assert.match(decisions, /Option B/);
  assert.match(decisions, /unit_price_est/);
  assert.match(decisions, /grn_items\.unit_cost/);
  assert.match(decisions, /Khi duyệt PO/);
});

test("D089 SOP happy path is GRN draft → PO → confirm without warehouse price", () => {
  const sop = readRepo("docs/ref/inventory-sop.md");
  assert.match(sop, /GRN draft → PO từ GRN → duyệt PO → confirm/);
  assert.match(sop, /\*\*Không\*\* nhập đơn giá/);
  assert.doesNotMatch(sop, /không yêu cầu PO/);
});

test("D089 warehouse GRN create editor has no unit-cost input", () => {
  const editor = read(
    "app/(protected)/inventory/_components/grn-line-editor.tsx",
  );
  assert.doesNotMatch(editor, /MoneyVndInput/);
  assert.doesNotMatch(editor, /grn-line-unit-cost/);
  assert.doesNotMatch(editor, /priceSetOnPoHint/);
  assert.match(editor, /edit\.quantity > 0/);
  assert.doesNotMatch(editor, /edit\.unitCost != null/);
});

test("D089 branch GRN create sheet has no cost number pad", () => {
  const sheet = read(
    "app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
  );
  assert.doesNotMatch(sheet, /branch-grn-create-cost/);
  assert.doesNotMatch(sheet, /priceSetOnPoHint/);
});

test("D089 upsertGrnLine ignores warehouse unitCost for draft authority", () => {
  const actions = read("app/(protected)/inventory/grn-actions.ts");
  assert.match(actions, /D089: warehouse cannot set commercial price on draft/);
  assert.match(actions, /existingCost/);
  assert.match(
    actions,
    /Number\.isFinite\(existingCost\) && existingCost > 0 \? existingCost : 0/,
  );
});

test("D089 approve_purchase_order syncs PO price into GRN unit_cost", () => {
  const migration = readRepo(
    "supabase/migrations/20260728143000_d089_po_price_sync_to_grn.sql",
  );
  assert.match(migration, /approve_purchase_order/);
  assert.match(migration, /unit_price_est required on all lines/);
  assert.match(migration, /unit_cost = poi\.unit_price_est/);
  assert.match(migration, /po_unit_price = poi\.unit_price_est/);
  assert.match(migration, /grn_unit_cost_synced_lines/);
});

test("D088 confirm gate still fail-closed without approved PO", () => {
  const gate = readRepo(
    "supabase/migrations/20260728141000_d088_grn_po_confirm_gate.sql",
  );
  assert.match(gate, /grn_confirm_requires_approved_po/);
  assert.match(gate, /create_purchase_order_from_grn/);
});

test("D089 controller does not block submit on missing draft prices", () => {
  const controller = read("lib/inventory/use-grn-create-controller.ts");
  assert.doesNotMatch(controller, /toastMissingPrices/);
  assert.match(controller, /const unitCost = 0/);
  assert.match(
    controller,
    /lineCount > 0 && !submitting && !receivingSiteSaving/,
  );
});

test("D089 draft DETAIL and create footers hide money before PO sync", () => {
  const copy = read("lib/inventory/grn-create-copy.ts");
  const createClient = read(
    "app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );
  const detailClient = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  const draftCard = read(
    "app/(protected)/inventory/grn/[id]/views/draft-grn-line-card.tsx",
  );
  const branchCreate = read(
    "app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/branch-grn-create-client.tsx",
  );

  assert.match(
    copy,
    /footerLineSummary:\s*\(lineCount: number\) =>[\s\S]*mặt hàng/,
  );
  assert.doesNotMatch(copy, /priceOnPoShort/);
  assert.doesNotMatch(copy, /priceSetOnPoHint/);
  assert.doesNotMatch(copy, /Giá mua trên PO|Giá trên PO|\(PO\)/);
  assert.doesNotMatch(copy, /priceRequired:\s*"Nhập giá"/);
  assert.doesNotMatch(copy, /linePriceRequired:|toastMissingPrices:/);

  assert.match(createClient, /footerLineSummary\(\s*controller\.lineCount\s*\)/);
  assert.doesNotMatch(
    createClient,
    /footerLineSummary\(\s*controller\.lineCount\s*,\s*controller\.total/,
  );

  assert.match(detailClient, /footerLineSummary\(\s*lines\.length\s*\)/);
  assert.doesNotMatch(detailClient, /priceRequired/);
  assert.match(detailClient, /cost > 0[\s\S]*inventoryCommon\.noValue/);
  assert.doesNotMatch(detailClient, /priceOnPoShort/);

  assert.doesNotMatch(draftCard, /priceRequired/);
  assert.doesNotMatch(draftCard, /priceOnPoShort/);
  assert.match(draftCard, /lineTotal != null[\s\S]*null/);

  assert.doesNotMatch(
    branchCreate,
    /headerHint=\{GRN_CREATE_COPY\.priceOnPoShort\}/,
  );
  assert.doesNotMatch(
    branchCreate,
    /moneyVnd\(controller\.total\)/,
  );
});

test("D089 add-line dialogs have no dead warehouse unitCost state", () => {
  const addDialog = read(
    "app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
  );
  const addSheetStart = read(
    "app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
  ).split("export function BranchGrnAddLineSheet")[1];

  assert.doesNotMatch(addDialog, /const \[unitCost/);
  assert.doesNotMatch(addDialog, /getReferenceCostForUnit/);
  assert.doesNotMatch(addDialog, /priceSetOnPoHint/);

  assert.ok(addSheetStart, "BranchGrnAddLineSheet export exists");
  assert.doesNotMatch(addSheetStart, /const \[unitCost/);
  assert.doesNotMatch(addSheetStart, /getReferenceCostForUnit/);
  assert.doesNotMatch(addSheetStart, /priceSetOnPoHint/);
});
