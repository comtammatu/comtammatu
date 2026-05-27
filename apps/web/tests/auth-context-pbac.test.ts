import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const authSource = readFileSync(
  join(process.cwd(), "app/_lib/auth.ts"),
  "utf8",
);
const staffActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/admin/staff/actions.ts"),
  "utf8",
);
const withActionSource = readFileSync(
  join(process.cwd(), "app/_lib/with-action.ts"),
  "utf8",
);
const hrActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/actions.ts"),
  "utf8",
);
const hrContractActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/hr/contract-actions.ts"),
  "utf8",
);
const supplierActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/supplier-actions.ts"),
  "utf8",
);
const supplierReturnActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/supplier-return-actions.ts"),
  "utf8",
);
const purchaseOrderActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/purchase-order-actions.ts"),
  "utf8",
);
const grnActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/grn-actions.ts"),
  "utf8",
);
const supplierInvoicesClientSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
  ),
  "utf8",
);
const migrationsDir = join(process.cwd(), "../../supabase/migrations");
const supplierInvoiceSourceRlsMigration = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => readFileSync(join(migrationsDir, filename), "utf8"))
  .find((source) =>
    source.includes("private.can_access_supplier_invoice_source"),
  );
const procurementSourceRlsMigration = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => readFileSync(join(migrationsDir, filename), "utf8"))
  .find(
    (source) =>
      source.includes("private.can_access_purchase_order_source") &&
      source.includes("private.can_access_grn_source"),
  );
const supplierReturnSourceRlsMigration = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => readFileSync(join(migrationsDir, filename), "utf8"))
  .find((source) =>
    source.includes("private.can_access_supplier_return_source"),
  );
const procurementCatalogScopeMigration = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => readFileSync(join(migrationsDir, filename), "utf8"))
  .find((source) =>
    source.includes(
      "Greenfield PBAC cleanup: procurement catalog tenant/branch scope",
    ),
  );
const canonicalPositionCodeMigration = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => readFileSync(join(migrationsDir, filename), "utf8"))
  .find((source) =>
    source.includes("Greenfield PBAC cleanup: canonical position codes"),
  );
const positionRoleBridgeRuntimeMigration = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => readFileSync(join(migrationsDir, filename), "utf8"))
  .find((source) =>
    source.includes(
      "Greenfield PBAC cleanup: derive runtime role buckets from",
    ),
  );

function sourceBetween(start: string, end: string): string {
  const startIndex = authSource.indexOf(start);
  const endIndex = authSource.indexOf(end);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return authSource.slice(startIndex, endIndex);
}

test("permission-specific auth helpers bypass role gate and keep parallel probes", () => {
  assert.match(
    authSource,
    /export async function getAuthenticatedActionContext\(\) \{\s*return getAuthenticatedContext\(\);\s*\}/,
  );

  const byPermission = sourceBetween(
    "export async function getAuthContextByPermission",
    "/**\n * OR-semantics",
  );
  assert.match(byPermission, /getAuthenticatedContext\(\)/);
  assert.doesNotMatch(byPermission, /getAuthContext\(/);

  const byAnyPermission = sourceBetween(
    "export async function getAuthContextByAnyPermission",
    "/**\n * AND-semantics",
  );
  assert.match(byAnyPermission, /getAuthenticatedContext\(\)/);
  assert.match(byAnyPermission, /Promise\.all\(/);
  assert.doesNotMatch(byAnyPermission, /getAuthContext\(/);

  const byPermissions = sourceBetween(
    "export async function getAuthContextByPermissions",
    "type LoadedAuthState",
  );
  assert.match(byPermissions, /getAuthenticatedContext\(\)/);
  assert.match(byPermissions, /Promise\.all\(/);
  assert.doesNotMatch(byPermissions, /getAuthContext\(/);
});

test("tenant permission probe distinguishes tenant-wide grants from branch grants", () => {
  const anyBranchGrant = sourceBetween(
    "const hasPermissionGrant",
    "const hasTenantPermissionGrant",
  );
  assert.match(anyBranchGrant, /has_permission_any/);

  const tenantGrant = sourceBetween(
    "const hasTenantPermissionGrant",
    "// Cheap permission probe",
  );
  assert.match(tenantGrant, /has_permission/);
  assert.match(tenantGrant, /p_branch_id:\s*null as unknown as number/);
  assert.doesNotMatch(tenantGrant, /has_permission_any/);

  assert.match(
    authSource,
    /export async function probeTenantPermission\([\s\S]*return hasTenantPermissionGrant\(ctx, permission\);[\s\S]*\}/,
  );
  assert.match(
    authSource,
    /export async function getAuthContextByTenantPermission\([\s\S]*hasTenantPermissionGrant\(ctx, permission\)/,
  );
  assert.match(
    authSource,
    /export async function getAuthContextWithTenantPermission\([\s\S]*hasTenantPermissionGrant\(ctx, permission\)/,
  );
});

test("role-plus-permission auth helpers preserve role gate semantics", () => {
  const withPermission = sourceBetween(
    "export async function getAuthContextWithPermission",
    "export async function getAuthContextByPermission",
  );
  assert.match(withPermission, /getAuthContext\(allowedRoles\)/);

  const withAnyPermission = sourceBetween(
    "export async function getAuthContextWithAnyPermission",
    "export async function getAuthContextByAnyPermission",
  );
  assert.match(withAnyPermission, /getAuthContext\(allowedRoles\)/);
  assert.match(withAnyPermission, /Promise\.all\(/);

  const withPermissions = sourceBetween(
    "export async function getAuthContextWithPermissions",
    "export async function getAuthContextByPermissions",
  );
  assert.match(withPermissions, /getAuthContext\(allowedRoles\)/);
  assert.match(withPermissions, /Promise\.all\(/);
});

test("staff management actions use permission-first PBAC helpers", () => {
  assert.match(
    staffActionsSource,
    /getAuthContextByPermissions\(POSITION_ASSIGN_PERMISSIONS\)/,
  );
  assert.match(
    staffActionsSource,
    /getAuthContextByPermission\(PERMISSION_KEYS\.STAFF_MANAGE\)/,
  );
  assert.doesNotMatch(staffActionsSource, /getAuthContextWithPermissions\(/);
  assert.doesNotMatch(staffActionsSource, /getAuthContextWithPermission\(/);
});

test("withAction keeps role gate by default and supports permission-first mode", () => {
  assert.match(
    withActionSource,
    /type PermissionMode = "role-and-permission" \| "permission"/,
  );
  assert.match(withActionSource, /permissionMode\?: PermissionMode/);
  assert.match(withActionSource, /type PermissionScope = "any" \| "tenant"/);
  assert.match(withActionSource, /permissionScope\?: PermissionScope/);
  assert.match(
    withActionSource,
    /opts\.permissionScope === "tenant"[\s\S]*getAuthContextByTenantPermission\(opts\.permission\)/,
  );
  assert.match(
    withActionSource,
    /opts\.permissionMode === "permission"[\s\S]*getAuthContextByPermission\(opts\.permission, branchId\)/,
  );
  assert.match(
    withActionSource,
    /getAuthContextWithPermission\(opts\.roles, opts\.permission, branchId\)/,
  );
});

test("HR employee and contract actions opt into permission-first PBAC", () => {
  assert.match(
    hrActionsSource,
    /getAuthContextByAnyPermission\(\[\s*PERMISSION_KEYS\.HR_VIEW_EMPLOYEE,\s*PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE,\s*\]\)/,
  );
  assert.match(
    hrActionsSource,
    /permission:\s*PERMISSION_KEYS\.HR_MANAGE_EMPLOYEE,\s*permissionMode:\s*"permission"/,
  );
  assert.doesNotMatch(hrActionsSource, /getAuthContextWithPermission\(/);

  assert.equal(
    hrContractActionsSource.match(/permissionMode:\s*"permission"/g)?.length,
    3,
  );
});

test("supplier procurement actions use permission-first PBAC", () => {
  assert.match(
    supplierActionsSource,
    /getAuthContextByPermission\(\s*PERMISSION_KEYS\.PROCUREMENT_READ,\s*\)/,
  );
  assert.match(supplierActionsSource, /getAuthContextByTenantPermission/);
  assert.match(
    supplierActionsSource,
    /permission:\s*PERMISSION_KEYS\.PROCUREMENT_SUPPLIER_MANAGE,\s*permissionMode:\s*"permission",\s*permissionScope:\s*"tenant"/,
  );
  assert.match(
    supplierActionsSource,
    /updateSupplier[\s\S]*getAuthContextByTenantPermission\(\s*PERMISSION_KEYS\.PROCUREMENT_SUPPLIER_MANAGE,\s*\)/,
  );
  assert.match(
    supplierActionsSource,
    /deleteSupplier[\s\S]*getAuthContextByTenantPermission\(\s*PERMISSION_KEYS\.PROCUREMENT_SUPPLIER_MANAGE,\s*\)/,
  );
  assert.doesNotMatch(supplierActionsSource, /getAuthContextWithPermission\(/);
});

test("supplier return actions use permission-first branch PBAC", () => {
  assert.match(supplierReturnActionsSource, /getAuthenticatedActionContext/);
  assert.match(supplierReturnActionsSource, /probePermission/);
  assert.match(supplierReturnActionsSource, /probeTenantPermission/);
  assert.doesNotMatch(
    supplierReturnActionsSource,
    /getAuthContextWithPermission\(/,
  );
  assert.match(
    supplierReturnActionsSource,
    /async function getSupplierReturnReadScope[\s\S]*resolveSupplierReturnBranchScope\(\s*ctx,\s*PERMISSION_KEYS\.SUPPLIER_RETURN_READ,\s*branchId,\s*\)/,
  );
  assert.match(
    supplierReturnActionsSource,
    /fetchSupplierReturns[\s\S]*getSupplierReturnReadScope\(branchId\)[\s\S]*query = query\.eq\("branch_id", effectiveBranchId\)/,
  );
  assert.match(
    supplierReturnActionsSource,
    /async function getSupplierReturnPermissionContext[\s\S]*from\("supplier_returns"\)[\s\S]*select\("id, branch_id"\)[\s\S]*probePermission\([\s\S]*supplierReturn\.branch_id/,
  );
  assert.match(
    supplierReturnActionsSource,
    /createSupplierReturnFromGrn[\s\S]*permission:\s*PERMISSION_KEYS\.SUPPLIER_RETURN_CREATE,\s*permissionMode:\s*"permission"/,
  );
  assert.match(
    supplierReturnActionsSource,
    /createSupplierReturnFromStock[\s\S]*permission:\s*PERMISSION_KEYS\.SUPPLIER_RETURN_CREATE,\s*permissionMode:\s*"permission",\s*permissionBranchId:\s*\(data\) => data\.branchId/s,
  );
  assert.match(
    supplierReturnActionsSource,
    /confirmSupplierReturn[\s\S]*getSupplierReturnPermissionContext\(\s*id\.data,\s*PERMISSION_KEYS\.SUPPLIER_RETURN_CONFIRM,\s*\)/,
  );
  assert.match(
    supplierReturnActionsSource,
    /transitionSupplierReturn[\s\S]*permission:\s*PERMISSION_KEYS\.SUPPLIER_RETURN_CONFIRM,\s*permissionMode:\s*"permission"[\s\S]*getSupplierReturnPermissionContext\(\s*data\.returnId,\s*PERMISSION_KEYS\.SUPPLIER_RETURN_CONFIRM,\s*\)/,
  );
});

test("procurement PO list actions resolve tenant grant before branch fallback", () => {
  assert.match(purchaseOrderActionsSource, /probeTenantPermission/);
  assert.match(
    purchaseOrderActionsSource,
    /async function resolveProcurementBranchScope[\s\S]*probeTenantPermission\(ctx, permission\)[\s\S]*ctx\.claims\.branch_id[\s\S]*probePermission\(ctx, permission, assignedBranchId\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /fetchPurchaseOrders[\s\S]*getProcurementReadScope\(branchId\)[\s\S]*query = query\.eq\("branch_id", effectiveBranchId\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /fetchOpenPurchaseOrdersForReceiving[\s\S]*getProcurementReadScope\(\)[\s\S]*query = query\.eq\("branch_id", effectiveBranchId\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /permission:\s*PERMISSION_KEYS\.PROCUREMENT_PO_CREATE,\s*permissionMode:\s*"permission",\s*permissionBranchId:\s*\(data\) => data\.branchId/s,
  );
  assert.doesNotMatch(
    purchaseOrderActionsSource,
    /getAuthContextWithPermission\(ROLES, PERMISSION_KEYS\.PROCUREMENT_READ\)/,
  );
});

test("tenant-wide PO price intelligence is permission-first and branch-filtered", () => {
  assert.match(
    purchaseOrderActionsSource,
    /fetchSinglePriceDeviation[\s\S]*permissionMode:\s*"permission"[\s\S]*resolveProcurementBranchScope\(\s*ctx,\s*PERMISSION_KEYS\.PROCUREMENT_READ,\s*\)[\s\S]*goods_received_notes!inner \( supplier_id, status, received_date, branch_id \)[\s\S]*goods_received_notes\.branch_id/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /fetchIngredientPriceHistory[\s\S]*permissionMode:\s*"permission"[\s\S]*resolveProcurementBranchScope\(\s*ctx,\s*PERMISSION_KEYS\.PROCUREMENT_READ,\s*\)[\s\S]*goods_received_notes!inner \( id, grn_number, received_date, status, supplier_id, branch_id, suppliers \( id, name \) \)[\s\S]*goods_received_notes\.branch_id/,
  );
});

test("PO resource-id actions resolve branch before permission PBAC", () => {
  assert.match(
    purchaseOrderActionsSource,
    /async function getPurchaseOrderPermissionContext[\s\S]*probePermission\(ctx, permission, po\.branch_id\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /fetchPurchaseOrderDetail[\s\S]*getPurchaseOrderPermissionContext\(\s*id\.data,\s*PERMISSION_KEYS\.PROCUREMENT_READ,\s*\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /upsertPurchaseOrderLine[\s\S]*permissionMode:\s*"permission"[\s\S]*getPurchaseOrderPermissionContext\(\s*data\.poId,\s*PERMISSION_KEYS\.PROCUREMENT_PO_CREATE,\s*\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /deletePurchaseOrderLine[\s\S]*permissionMode:\s*"permission"[\s\S]*getPurchaseOrderPermissionContext\(\s*data\.poId,\s*PERMISSION_KEYS\.PROCUREMENT_PO_CREATE,\s*\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /updatePurchaseOrderStatus[\s\S]*getPurchaseOrderPermissionContext\(\s*parsed\.data\.poId,\s*PERMISSION_KEYS\.PROCUREMENT_PO_CREATE,\s*\)/,
  );
  assert.match(
    purchaseOrderActionsSource,
    /fetchPriceDeviations[\s\S]*permissionMode:\s*"permission"[\s\S]*getPurchaseOrderPermissionContext\(\s*data\.poId,\s*PERMISSION_KEYS\.PROCUREMENT_READ,\s*\)/,
  );
});

test("procurement GRN list actions resolve tenant grant before branch fallback", () => {
  assert.match(grnActionsSource, /probeTenantPermission/);
  assert.match(
    grnActionsSource,
    /async function resolveProcurementBranchScope[\s\S]*probeTenantPermission\(ctx, permission\)[\s\S]*ctx\.claims\.branch_id[\s\S]*probePermission\(ctx, permission, assignedBranchId\)/,
  );
  assert.match(
    grnActionsSource,
    /fetchRecentActivity[\s\S]*getProcurementReadScope\(branchId\)[\s\S]*invQuery = invQuery\.eq\("goods_received_notes\.branch_id", effectiveBranchId\)/,
  );
  assert.match(
    grnActionsSource,
    /fetchGrns[\s\S]*getProcurementReadScope\(branchId\)[\s\S]*query = query\.eq\("branch_id", effectiveBranchId\)/,
  );
  assert.match(
    grnActionsSource,
    /permission:\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*permissionMode:\s*"permission",\s*permissionBranchId:\s*\(data\) => data\.branchId/s,
  );
  assert.match(
    grnActionsSource,
    /fetchSupplierInvoices[\s\S]*getProcurementReadScope\(branchId\)[\s\S]*goods_received_notes!inner \( id, grn_number, branch_id \)[\s\S]*goods_received_notes\.branch_id/,
  );
  assert.doesNotMatch(
    grnActionsSource,
    /getAuthContextWithPermission\(ROLES, PERMISSION_KEYS\.PROCUREMENT_READ\)/,
  );
});

test("GRN draft reads use permission-first branch scope", () => {
  assert.match(
    grnActionsSource,
    /loadActiveGrnDraft[\s\S]*permissionMode:\s*"permission"[\s\S]*resolveProcurementBranchScope\(\s*ctx,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*\)[\s\S]*query = query\.eq\("branch_id", scope\.branchId\)/,
  );
  assert.match(
    grnActionsSource,
    /listMyGrnDrafts[\s\S]*getAuthenticatedActionContext\(\)[\s\S]*resolveProcurementBranchScope\(\s*ctx,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*\)[\s\S]*query = query\.eq\("branch_id", scope\.branchId\)/,
  );
});

test("supplier invoice mutations resolve GRN/PO branch before permission PBAC", () => {
  assert.match(
    grnActionsSource,
    /async function resolveSupplierInvoiceSource[\s\S]*from\("goods_received_notes"\)[\s\S]*select\("id, branch_id, supplier_id, po_id"\)[\s\S]*assertProcurementBranchPermission\(\s*ctx,\s*permission,\s*grn\.branch_id,\s*\)[\s\S]*poId: input\.poId \?\? grn\.po_id \?\? null/,
  );
  assert.match(
    grnActionsSource,
    /async function resolveSupplierInvoiceSource[\s\S]*from\("purchase_orders"\)[\s\S]*select\("id, branch_id, supplier_id"\)[\s\S]*assertProcurementBranchPermission\(\s*ctx,\s*permission,\s*po\.branch_id,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /Phải liên kết hóa đơn với GRN hoặc PO để xác định kho/,
  );
  assert.match(
    grnActionsSource,
    /createSupplierInvoice[\s\S]*permission:\s*PERMISSION_KEYS\.PROCUREMENT_INVOICE_CREATE,\s*permissionMode:\s*"permission"[\s\S]*resolveSupplierInvoiceSource\([\s\S]*PERMISSION_KEYS\.PROCUREMENT_INVOICE_CREATE[\s\S]*supplier_id: source\.supplierId[\s\S]*grn_id: source\.grnId[\s\S]*po_id: source\.poId/,
  );
  assert.match(
    grnActionsSource,
    /async function getSupplierInvoicePermissionContext[\s\S]*from\("supplier_invoices"\)[\s\S]*select\("id, supplier_id, grn_id, po_id"\)[\s\S]*resolveSupplierInvoiceSource/,
  );
  assert.match(
    grnActionsSource,
    /recomputeInvoiceMatching[\s\S]*getSupplierInvoicePermissionContext\(\s*id\.data,\s*PERMISSION_KEYS\.PROCUREMENT_INVOICE_MATCH,\s*\)/,
  );
  assert.doesNotMatch(
    grnActionsSource,
    /getAuthContextWithPermission\(ROLES, PERMISSION_KEYS\.PROCUREMENT_INVOICE_MATCH\)/,
  );
});

test("supplier invoice create UI requires GRN instead of supplier-only invoices", () => {
  assert.match(
    supplierInvoicesClientSource,
    /if \(!selectedGrn\) \{\s*toast\.error\(copy\.chooseGrnFirst\);/,
  );
  assert.match(
    supplierInvoicesClientSource,
    /supplierId: selectedGrn\.supplierId,\s*grnId: selectedGrn\.id,/,
  );
  assert.match(
    supplierInvoicesClientSource,
    /<SelectValue placeholder=\{copy\.chooseGrnRequired\} \/>/,
  );
  assert.match(supplierInvoicesClientSource, /disabled=\{!selectedGrn\}/);
  assert.doesNotMatch(
    supplierInvoicesClientSource,
    /selectedGrn\?\.supplierId \?\? Number\(supplierId \|\| 0\)/,
  );
});

test("supplier invoice RLS is source-scoped and does not use tenant-wide permission probes", () => {
  assert.ok(
    supplierInvoiceSourceRlsMigration,
    "Missing supplier invoice source-scoped RLS migration",
  );

  assert.match(
    supplierInvoiceSourceRlsMigration,
    /ADD CONSTRAINT supplier_invoices_source_required[\s\S]*CHECK \(grn_id IS NOT NULL OR po_id IS NOT NULL\)[\s\S]*NOT VALID/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /CREATE OR REPLACE FUNCTION private\.can_access_supplier_invoice_source/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /REVOKE ALL ON FUNCTION private\.can_access_supplier_invoice_source\(BIGINT, BIGINT, BIGINT, BIGINT, TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /GRANT EXECUTE ON FUNCTION private\.can_access_supplier_invoice_source\(BIGINT, BIGINT, BIGINT, BIGINT, TEXT\)[\s\S]*TO authenticated/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /IF v_source_supplier_id IS DISTINCT FROM p_supplier_id[\s\S]*RETURN false/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /IF p_po_id IS NOT NULL AND p_po_id IS DISTINCT FROM v_source_po_id[\s\S]*RETURN false/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /CREATE POLICY "supplier_invoices_select"[\s\S]*procurement:read[\s\S]*procurement:invoice_create[\s\S]*procurement:invoice_match/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /CREATE POLICY "supplier_invoices_insert"[\s\S]*procurement:invoice_create/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /CREATE POLICY "supplier_invoices_update"[\s\S]*procurement:invoice_create[\s\S]*procurement:invoice_match/,
  );
  assert.match(
    supplierInvoiceSourceRlsMigration,
    /CREATE POLICY "supplier_invoices_delete"[\s\S]*procurement:invoice_create/,
  );
  assert.doesNotMatch(supplierInvoiceSourceRlsMigration, /has_permission_any/);
  assert.doesNotMatch(
    supplierInvoiceSourceRlsMigration,
    /CREATE POLICY "supplier_invoices_write"/,
  );
});

test("PO and GRN RLS is source-scoped and does not use tenant-wide permission probes", () => {
  assert.ok(
    procurementSourceRlsMigration,
    "Missing procurement source-scoped RLS migration",
  );

  assert.match(
    procurementSourceRlsMigration,
    /CREATE OR REPLACE FUNCTION private\.can_access_purchase_order_source/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE OR REPLACE FUNCTION private\.can_access_grn_source/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /REVOKE ALL ON FUNCTION private\.can_access_purchase_order_source\(BIGINT, BIGINT, TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /GRANT EXECUTE ON FUNCTION private\.can_access_purchase_order_source\(BIGINT, BIGINT, TEXT\)[\s\S]*TO authenticated/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /REVOKE ALL ON FUNCTION private\.can_access_grn_source\(BIGINT, BIGINT, TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /GRANT EXECUTE ON FUNCTION private\.can_access_grn_source\(BIGINT, BIGINT, TEXT\)[\s\S]*TO authenticated/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_orders_select"[\s\S]*public\.has_permission\(branch_id, 'procurement:read'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:po_create'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:po_approve'\)/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_orders_insert"[\s\S]*public\.has_permission\(branch_id, 'procurement:po_create'\)/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_orders_update"[\s\S]*public\.has_permission\(branch_id, 'procurement:po_create'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:po_approve'\)/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_order_items_select"[\s\S]*private\.can_access_purchase_order_source[\s\S]*procurement:read[\s\S]*procurement:po_create[\s\S]*procurement:po_approve/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_order_items_insert"[\s\S]*private\.can_access_purchase_order_source[\s\S]*procurement:po_create/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_order_items_update"[\s\S]*private\.can_access_purchase_order_source[\s\S]*procurement:po_create/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_order_items_delete"[\s\S]*private\.can_access_purchase_order_source[\s\S]*procurement:po_create/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_select"[\s\S]*public\.has_permission\(branch_id, 'procurement:read'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:grn_create'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:grn_confirm'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:grn_amend'\)/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_insert"[\s\S]*public\.has_permission\(branch_id, 'procurement:grn_create'\)/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_update"[\s\S]*public\.has_permission\(branch_id, 'procurement:grn_create'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:grn_confirm'\)[\s\S]*public\.has_permission\(branch_id, 'procurement:grn_amend'\)/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_items_select"[\s\S]*private\.can_access_grn_source[\s\S]*procurement:read[\s\S]*procurement:grn_create[\s\S]*procurement:grn_confirm[\s\S]*procurement:grn_amend/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_items_insert"[\s\S]*private\.can_access_grn_source[\s\S]*procurement:grn_create/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_items_update"[\s\S]*private\.can_access_grn_source[\s\S]*procurement:grn_create/,
  );
  assert.match(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_items_delete"[\s\S]*private\.can_access_grn_source[\s\S]*procurement:grn_create/,
  );
  assert.doesNotMatch(procurementSourceRlsMigration, /has_permission_any/);
  assert.doesNotMatch(
    procurementSourceRlsMigration,
    /CREATE POLICY "purchase_order_items_write"/,
  );
  assert.doesNotMatch(
    procurementSourceRlsMigration,
    /CREATE POLICY "grn_items_write"/,
  );
});

test("supplier return RLS is source-scoped for line items and credit notes", () => {
  assert.ok(
    supplierReturnSourceRlsMigration,
    "Missing supplier return source-scoped RLS migration",
  );

  assert.match(
    supplierReturnSourceRlsMigration,
    /CREATE OR REPLACE FUNCTION private\.can_access_supplier_return_source/,
  );
  assert.match(
    supplierReturnSourceRlsMigration,
    /REVOKE ALL ON FUNCTION private\.can_access_supplier_return_source\(BIGINT, BIGINT, TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    supplierReturnSourceRlsMigration,
    /GRANT EXECUTE ON FUNCTION private\.can_access_supplier_return_source\(BIGINT, BIGINT, TEXT\)[\s\S]*TO authenticated/,
  );
  assert.match(
    supplierReturnSourceRlsMigration,
    /CREATE POLICY "supplier_returns_select"[\s\S]*public\.has_permission\(branch_id, 'supplier_return:read'\)[\s\S]*public\.has_permission\(branch_id, 'supplier_return:create'\)[\s\S]*public\.has_permission\(branch_id, 'supplier_return:confirm'\)/,
  );
  assert.match(
    supplierReturnSourceRlsMigration,
    /CREATE POLICY "supplier_return_items_select"[\s\S]*private\.can_access_supplier_return_source[\s\S]*supplier_return:read[\s\S]*supplier_return:create[\s\S]*supplier_return:confirm/,
  );
  assert.match(
    supplierReturnSourceRlsMigration,
    /CREATE POLICY "supplier_credit_notes_select"[\s\S]*private\.can_access_supplier_return_source[\s\S]*supplier_return:read[\s\S]*supplier_return:confirm/,
  );
  assert.doesNotMatch(supplierReturnSourceRlsMigration, /has_permission_any/);
  assert.doesNotMatch(
    supplierReturnSourceRlsMigration,
    /has_permission\(NULL, 'procurement:read'\)/,
  );
});

test("procurement catalog PBAC keeps tenant catalog data and branch/either reads distinct", () => {
  assert.ok(
    procurementCatalogScopeMigration,
    "Missing procurement catalog tenant/branch scope migration",
  );

  assert.match(
    procurementCatalogScopeMigration,
    /scope = 'either'[\s\S]*key = 'procurement:price_list_read'/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /scope = 'tenant'[\s\S]*key IN \('procurement:supplier_manage', 'procurement:price_list_write'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /DELETE FROM public\.staff_permissions sp[\s\S]*pk\.scope = 'tenant'[\s\S]*sp\.branch_id IS NOT NULL/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE OR REPLACE FUNCTION private\.staff_permission_effective_branch_id/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE TRIGGER trg_staff_permissions_scope[\s\S]*EXECUTE FUNCTION private\.enforce_staff_permission_scope\(\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE OR REPLACE FUNCTION public\.grant_permission[\s\S]*v_effective_branch_id := private\.staff_permission_effective_branch_id[\s\S]*public\.has_permission\(v_effective_branch_id, 'staff:assign_permission'\)[\s\S]*branch_id, permission_key[\s\S]*v_effective_branch_id, p_permission_key/s,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE OR REPLACE FUNCTION public\.revoke_permission[\s\S]*v_effective_branch_id := private\.staff_permission_effective_branch_id[\s\S]*public\.has_permission\(v_effective_branch_id, 'staff:assign_permission'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE OR REPLACE FUNCTION public\.apply_template_to_user[\s\S]*v_effective_branch_id := private\.staff_permission_effective_branch_id\(\s*v_perm_key,\s*p_branch_id\s*\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE OR REPLACE FUNCTION public\.sync_missing_permissions_from_template[\s\S]*v_profile\.role IN \('owner', 'super_manager', 'office'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /DROP FUNCTION IF EXISTS public\.apply_template_to_user\(UUID, BIGINT, BIGINT\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE POLICY "suppliers_select"[\s\S]*public\.has_permission_any\('procurement:read'\)[\s\S]*public\.has_permission\(NULL, 'procurement:supplier_manage'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE POLICY "suppliers_insert"[\s\S]*public\.has_permission\(NULL, 'procurement:supplier_manage'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE POLICY "price_list_read"[\s\S]*public\.has_permission_any\('procurement:price_list_read'\)[\s\S]*public\.has_permission\(NULL, 'procurement:price_list_write'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE POLICY "price_list_insert"[\s\S]*public\.has_permission\(NULL, 'procurement:price_list_write'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE POLICY "supplier_items_read"[\s\S]*public\.has_permission_any\('procurement:price_list_read'\)[\s\S]*public\.has_permission\(NULL, 'procurement:price_list_write'\)/,
  );
  assert.match(
    procurementCatalogScopeMigration,
    /CREATE POLICY "supplier_items_insert"[\s\S]*public\.has_permission\(NULL, 'procurement:price_list_write'\)/,
  );
  assert.doesNotMatch(
    procurementCatalogScopeMigration,
    /CREATE POLICY "price_list_write"/,
  );
  assert.doesNotMatch(
    procurementCatalogScopeMigration,
    /CREATE POLICY "supplier_items_write"/,
  );
});

test("position role bridge derives runtime role bucket from position code", () => {
  assert.ok(
    canonicalPositionCodeMigration,
    "Expected canonical position-code cleanup migration",
  );
  assert.ok(
    positionRoleBridgeRuntimeMigration,
    "Expected position role bridge runtime cleanup migration",
  );
  assert.match(
    canonicalPositionCodeMigration,
    /UPDATE public\.positions p[\s\S]*SET code = m\.new_code/,
  );
  assert.match(
    canonicalPositionCodeMigration,
    /UPDATE public\.role_templates rt[\s\S]*SET position_code = m\.new_code/,
  );
  assert.match(
    canonicalPositionCodeMigration,
    /UPDATE auth\.users u[\s\S]*jsonb_set\([\s\S]*'\{position\}'/,
  );
  assert.match(
    canonicalPositionCodeMigration,
    /public\._auth_v2_role_to_position\(p_role TEXT\)[\s\S]*WHEN 'warehouse_manager'\s+THEN 'warehouse_head'[\s\S]*WHEN 'production_manager'\s+THEN 'head_chef'/,
  );
  assert.match(
    positionRoleBridgeRuntimeMigration,
    /CREATE OR REPLACE FUNCTION private\.staff_role_from_position_code/,
  );
  assert.match(
    positionRoleBridgeRuntimeMigration,
    /WHEN 'warehouse_head'\s+THEN 'warehouse_manager'/,
  );
  assert.match(
    positionRoleBridgeRuntimeMigration,
    /WHEN 'head_chef'\s+THEN 'production_manager'/,
  );
  assert.match(
    positionRoleBridgeRuntimeMigration,
    /public\.custom_access_token_hook[\s\S]*private\.staff_role_from_position_code\(po\.code\) AS user_role[\s\S]*'area_id', user_profile\.area_id/,
  );
  assert.match(
    positionRoleBridgeRuntimeMigration,
    /public\.auth_role\(\)[\s\S]*private\.staff_role_from_position_code\(po\.code\)/,
  );
  assert.match(
    positionRoleBridgeRuntimeMigration,
    /public\.admin_update_profile[\s\S]*private\.staff_role_from_position_code\(po\.code\)/,
  );
  assert.match(
    positionRoleBridgeRuntimeMigration,
    /public\.sync_missing_permissions_from_template[\s\S]*private\.staff_role_from_position_code\(pos\.code\) AS role/,
  );
});

test("GRN and PO-linked resource-id actions resolve branch before permission PBAC", () => {
  assert.match(
    grnActionsSource,
    /async function getGrnPermissionContext[\s\S]*probePermission\(ctx, permission, grn\.branch_id\)/,
  );
  assert.match(
    grnActionsSource,
    /async function getPurchaseOrderPermissionContext[\s\S]*probePermission\(ctx, permission, po\.branch_id\)/,
  );
  assert.match(
    grnActionsSource,
    /fetchGrnDetail[\s\S]*getGrnPermissionContext\(\s*id\.data,\s*PERMISSION_KEYS\.PROCUREMENT_READ,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /discardGrnDraft[\s\S]*permissionMode:\s*"permission"[\s\S]*getGrnPermissionContext\(\s*data\.grnId,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /upsertGrnLine[\s\S]*permissionMode:\s*"permission"[\s\S]*getGrnPermissionContext\(\s*data\.grnId,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /deleteGrnLine[\s\S]*permissionMode:\s*"permission"[\s\S]*getGrnPermissionContext\(\s*data\.grnId,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /confirmGrn[\s\S]*getGrnPermissionContext\(\s*id\.data,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CONFIRM,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /amendGrnLine[\s\S]*permissionMode:\s*"permission"[\s\S]*getGrnPermissionContext\(\s*data\.grnId,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_AMEND,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /fetchGrnsForPo[\s\S]*getPurchaseOrderPermissionContext\(\s*id\.data,\s*PERMISSION_KEYS\.PROCUREMENT_READ,\s*\)/,
  );
  assert.match(
    grnActionsSource,
    /createGrnFromPo[\s\S]*getPurchaseOrderPermissionContext\(\s*id\.data,\s*PERMISSION_KEYS\.PROCUREMENT_GRN_CREATE,\s*\)/,
  );
});
