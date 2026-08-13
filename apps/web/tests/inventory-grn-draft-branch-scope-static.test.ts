import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const grnActions = readRepo(
  "apps/web/app/(protected)/inventory/grn-actions.ts",
);
const grnListClient = readRepo(
  "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
);
const grnListModel = readRepo("apps/web/lib/inventory/grn-list-model.ts");
const grnListData = readRepo("apps/web/lib/inventory/grn-list-data.ts");
const grnListPage = readRepo("apps/web/app/(protected)/inventory/grn/page.tsx");
const branchGrnListClient = readRepo(
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
);
const grnNewPage = readRepo(
  "apps/web/app/(protected)/inventory/grn/new/page.tsx",
);
const poDraftMigration = readRepo(
  "supabase/migration-archive/20260708130514_separate_free_and_po_grn_drafts.sql",
);
const multiSupplierMigration = readRepo(
  "supabase/migration-archive/20260729010000_multi_supplier_grn_split_po.sql",
);

test("GRN drafts are created only from a purchase order", () => {
  assert.doesNotMatch(grnActions, /export const loadActiveGrnDraft/);
  assert.doesNotMatch(grnActions, /export const createGrnDraft/);
  assert.doesNotMatch(grnActions, /export async function listMyGrnDrafts/);
});

test("GRN free drafts and PO-linked drafts do not share the same unique slot", () => {
  assert.match(
    poDraftMigration,
    /DROP INDEX IF EXISTS public\.uq_grn_active_draft_per_user_supplier_branch;/,
  );
  assert.match(
    multiSupplierMigration,
    /CREATE UNIQUE INDEX uq_grn_active_free_draft_per_user_branch/,
  );
  assert.match(
    multiSupplierMigration,
    /ON public\.goods_received_notes \(tenant_id, created_by, branch_id\)/,
  );
  assert.match(grnListClient, /useDocumentOverlayUrl/);
  assert.match(grnListClient, /grnId:\s*row\.id/);
  assert.match(grnListModel, /return `\$\{basePath\}\/\$\{draft\.grnId\}`;/);
  assert.match(grnListModel, /export function grnDraftHref/);
  assert.match(grnListModel, /export function newGrnSupplierHref/);
  assert.match(grnListModel, /branchId: number/);
  assert.match(grnListModel, /branchId: String\(branchId\)/);
  assert.match(
    branchGrnListClient,
    /const href = `\$\{basePath\}\/\$\{draft\.grnId\}`;/,
  );
  assert.doesNotMatch(branchGrnListClient, /grnSourceSupplierHref/);
  assert.match(grnListClient, /\{row\.poCode\}/);
});

test("GRN new receipt redirects to the canonical queue", () => {
  assert.match(grnNewPage, /redirect\("\/inventory\/grn"\)/);
});

test("GRN list follows resolved scope and exposes only invoice authority", () => {
  assert.match(
    grnListData,
    /resolveInventoryListScope\(supabase, claims/,
  );
  assert.match(grnListData, /PERMISSION_KEYS\.PROCUREMENT_INVOICE_CREATE/);
  assert.match(grnListData, /\.rpc\("list_goods_receipt_notes"/);
  assert.doesNotMatch(grnListData, /PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE/);
  assert.match(
    grnListData,
    /p_branch_id: filters\.branchId/,
  );
  assert.match(
    grnListPage,
    /canManageSupplierInvoice=\{data\.canManageSupplierInvoice\}/,
  );
});

test("GRN drafts have no retired compatibility route", () => {
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/(protected)/inventory/drafts/page.tsx"),
    ),
    false,
  );
});
