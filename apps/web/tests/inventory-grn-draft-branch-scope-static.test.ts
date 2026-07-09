import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const grnActions = readRepo("apps/web/app/(protected)/inventory/grn-actions.ts");
const grnCreatePage = readRepo(
  "apps/web/app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
);
const grnListClient = readRepo(
  "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
);
const grnNewPage = readRepo("apps/web/app/(protected)/inventory/grn/new/page.tsx");
const grnSupplierPicker = readRepo(
  "apps/web/app/(protected)/inventory/grn/new/supplier-picker.tsx",
);
const grnCreateClient = readRepo(
  "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
);
const purchaseOrderActions = readRepo(
  "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
);
const migration = readRepo(
  "supabase/migrations/20260708111916_fix_grn_draft_branch_scope.sql",
);
const poDraftMigration = readRepo(
  "supabase/migrations/20260708130514_separate_free_and_po_grn_drafts.sql",
);

test("GRN supplier drafts are looked up in the selected receiving branch", () => {
  assert.match(
    grnActions,
    /branchId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/,
  );
  assert.match(
    grnCreatePage,
    /loadActiveGrnDraft\(\{\s*supplierId,\s*branchId: defaultBranchId \?\? undefined,\s*\}\)/,
  );

  const loadStart = grnActions.indexOf("export const loadActiveGrnDraft");
  assert.ok(loadStart >= 0, "loadActiveGrnDraft not found");
  const loadBody = grnActions.slice(
    loadStart,
    grnActions.indexOf("/* ─── listMyGrnDrafts", loadStart),
  );

  assert.match(loadBody, /\.eq\("branch_id", data\.branchId\)/);
  assert.match(loadBody, /\.is\("po_id", null\)/);
});

test("GRN supplier draft uniqueness includes the receiving branch", () => {
  assert.match(
    migration,
    /DROP INDEX IF EXISTS public\.uq_grn_active_draft_per_user_supplier;/,
  );
  assert.match(
    migration,
    /DROP INDEX IF EXISTS public\.uq_grn_active_draft_per_user_supplier_branch;/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX uq_grn_active_draft_per_user_supplier_branch/,
  );
  assert.match(
    migration,
    /ON public\.goods_received_notes \(tenant_id, created_by, supplier_id, branch_id\)/,
  );
  assert.match(
    migration,
    /WHERE status = 'draft' AND created_by IS NOT NULL;/,
  );

  const createStart = grnActions.indexOf("export const createGrnDraft");
  assert.ok(createStart >= 0, "createGrnDraft not found");
  const createBody = grnActions.slice(
    createStart,
    grnActions.indexOf("/* ─── loadActiveGrnDraft", createStart),
  );

  assert.match(createBody, /\.eq\("branch_id", targetBranchId\)/);
  assert.match(createBody, /\.is\("po_id", null\)/);
  assert.match(createBody, /po_id: null/);
  assert.doesNotMatch(createBody, /poId: z\.coerce/);
});

test("GRN free drafts and PO-linked drafts do not share the same unique slot", () => {
  assert.match(
    poDraftMigration,
    /DROP INDEX IF EXISTS public\.uq_grn_active_draft_per_user_supplier_branch;/,
  );
  assert.match(
    poDraftMigration,
    /CREATE UNIQUE INDEX uq_grn_active_free_draft_per_user_supplier_branch/,
  );
  assert.match(
    poDraftMigration,
    /ON public\.goods_received_notes \(tenant_id, created_by, supplier_id, branch_id\)/,
  );
  assert.match(
    poDraftMigration,
    /WHERE status = 'draft' AND created_by IS NOT NULL AND po_id IS NULL;/,
  );
  assert.match(
    poDraftMigration,
    /CREATE UNIQUE INDEX uq_grn_active_po_draft_per_user_po/,
  );
  assert.match(
    poDraftMigration,
    /ON public\.goods_received_notes \(tenant_id, created_by, po_id\)/,
  );
  assert.match(
    poDraftMigration,
    /WHERE status = 'draft' AND created_by IS NOT NULL AND po_id IS NOT NULL;/,
  );
  assert.match(
    grnListClient,
    /draft\.poId != null\s*\?\s*`\$\{basePath\}\/\$\{draft\.grnId\}\?review=1`/,
  );
  assert.match(
    grnListClient,
    /:\s*newGrnSupplierHref\(basePath,\s*draft\.supplierId,\s*draft\.branchId\)/,
  );
  assert.match(grnListClient, /branchId: number/);
  assert.match(grnListClient, /branchId: String\(branchId\)/);
  assert.match(grnListClient, /draft\.poCode\s*\?/);
  assert.match(grnListClient, /grn\.poId != null && grn\.poCode/);
});

test("GRN supplier receiving can stay on the same new-receipt page", () => {
  assert.match(grnNewPage, /supplierId\?: string \| string\[\]/);
  assert.match(grnNewPage, /const selectedSupplierId = parseSupplierIdParam/);
  assert.match(grnNewPage, /selectedSupplierId \? \(/);
  assert.match(grnNewPage, /supplierId=\{selectedSupplierId\}/);
  assert.match(grnNewPage, /searchParams=\{Promise\.resolve\(params\)\}/);
  assert.match(grnNewPage, /branchId=\{branchId\}/);

  assert.match(grnSupplierPicker, /function supplierHref\(supplierId: number\)/);
  assert.match(grnSupplierPicker, /new URLSearchParams\(\{ supplierId: String\(supplierId\) \}\)/);
  assert.match(grnSupplierPicker, /params\.set\("branchId", String\(branchId\)\)/);
  assert.doesNotMatch(grnSupplierPicker, /\$\{basePath\}\/\$\{supplier\.id\}/);

  assert.match(grnCreateClient, /confirmGrn/);
  assert.match(grnCreateClient, /GRN_CREATE_COPY\.confirmNow/);
  assert.doesNotMatch(grnCreateClient, /NumberPadSheet/);
  assert.doesNotMatch(grnCreateClient, /onOpenNumpad/);
});

test("GRN new PO picker follows the selected receiving branch", () => {
  assert.match(grnNewPage, /const branchId = scope\.selectedBranchId;/);
  assert.match(
    grnNewPage,
    /fetchOpenPurchaseOrdersForReceiving\(\s*branchId != null \? \{ branchId \} : undefined,\s*\)/,
  );

  const fetchStart = purchaseOrderActions.indexOf(
    "export async function fetchOpenPurchaseOrdersForReceiving",
  );
  assert.ok(fetchStart >= 0, "fetchOpenPurchaseOrdersForReceiving not found");
  const fetchBody = purchaseOrderActions.slice(
    fetchStart,
    purchaseOrderActions.indexOf("const { data, error } = await query", fetchStart),
  );

  assert.match(fetchBody, /fetchOpenPurchaseOrdersForReceivingSchema/);
  assert.match(fetchBody, /requestedBranchId/);
  assert.match(fetchBody, /canAccessProcurementBranch\(/);
  assert.match(fetchBody, /isBranchScopedProcurementRole\(claims\.user_role\)/);
  assert.match(fetchBody, /resolveCentralSiteHomeBranchId\(supabase, claims\)/);
  assert.match(
    fetchBody,
    /if \(branchFilter != null\) query = query\.eq\("branch_id", branchFilter\)/,
  );
});
