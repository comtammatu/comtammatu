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
const grnCreateData = readRepo("apps/web/lib/inventory/grn-create-data.ts");
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
const grnCreateController = readRepo(
  "apps/web/lib/inventory/use-grn-create-controller.ts",
);
const poDraftMigration = readRepo(
  "supabase/migration-archive/20260708130514_separate_free_and_po_grn_drafts.sql",
);
const multiSupplierMigration = readRepo(
  "supabase/migrations/20260729010000_multi_supplier_grn_split_po.sql",
);

test("GRN drafts are looked up in the selected receiving branch", () => {
  assert.match(
    grnActions,
    /branchId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(
    grnCreateData,
    /loadActiveGrnDraft\(\{\s*branchId: defaultBranchId,\s*\}\)/,
  );

  const loadStart = grnActions.indexOf("export const loadActiveGrnDraft");
  assert.ok(loadStart >= 0, "loadActiveGrnDraft not found");
  const loadBody = grnActions.slice(
    loadStart,
    grnActions.indexOf("/* ─── listMyGrnDrafts", loadStart),
  );

  assert.match(loadBody, /\.eq\("branch_id", data\.branchId\)/);
  assert.match(loadBody, /\.is\("po_id", null\)/);
  assert.doesNotMatch(loadBody, /\.eq\("supplier_id"/);
});

test("GRN free draft uniqueness includes the receiving branch", () => {
  const createStart = grnActions.indexOf("export const createGrnDraft");
  assert.ok(createStart >= 0, "createGrnDraft not found");
  const createBody = grnActions.slice(
    createStart,
    grnActions.indexOf("/* ─── loadActiveGrnDraft", createStart),
  );

  assert.match(createBody, /\.eq\("branch_id", targetBranchId\)/);
  assert.match(createBody, /\.is\("po_id", null\)/);
  assert.match(createBody, /po_id: null/);
  assert.match(createBody, /supplier_id: null/);
  assert.doesNotMatch(createBody, /supplierId: z\.coerce/);
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
  assert.match(grnListClient, /grnDraftHref\(basePath,\s*draft\)/);
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
  assert.match(grnListClient, /draft\.poCount > 0 && draft\.poCode/);
  assert.match(grnListClient, /grn\.poCount > 0 && grn\.poCode/);
});

test("GRN new receipt skips supplier picker and opens create directly", () => {
  assert.match(grnNewPage, /loadGrnCreatePageData/);
  assert.match(grnNewPage, /GrnCreateClient/);
  assert.doesNotMatch(grnNewPage, /SupplierPicker/);
  assert.doesNotMatch(grnNewPage, /parseGrnSupplierIdParam/);

  assert.doesNotMatch(grnCreateController, /confirmGrn|confirmNow/);
  assert.match(
    grnCreateController,
    /router\.push\(`\$\{grnBasePath\}\/\$\{grnId\}`\)/,
  );
  assert.match(grnCreateController, /supplierId: null/);
  assert.match(grnCreateController, /supplierSummary/);
  assert.doesNotMatch(grnCreateController, /NumberPadSheet/);
  assert.doesNotMatch(grnCreateController, /onOpenNumpad/);
});

test("GRN list creation and drafts follow the resolved branch grant", () => {
  assert.match(grnListData, /PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE/);
  assert.match(
    grnListData,
    /probePermission\(\s*auth,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*branchId\s*\)/,
  );
  assert.match(
    grnListData,
    /const shouldLoadDrafts = includeDrafts && canCreate/,
  );
  assert.match(
    grnListData,
    /shouldLoadDrafts \? listMyGrnDrafts\(routeBranchId\) : Promise\.resolve\(null\)/,
  );
  assert.match(grnListPage, /canCreate=\{data\.canCreate\}/);
  assert.match(
    grnListPage,
    /drafts=\{showDrafts && data\.canCreate \? data\.drafts : undefined\}/,
  );
  assert.match(grnListClient, /canCreate: boolean/);
  assert.match(grnListClient, /const desktopActions = canCreate \?/);
});

test("GRN drafts have no retired compatibility route", () => {
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/(protected)/inventory/drafts/page.tsx"),
    ),
    false,
  );
});
