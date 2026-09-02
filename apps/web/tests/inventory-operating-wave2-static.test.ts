import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("YCM create is hidden and redirects to Tạo đơn", () => {
  const paths = read("apps/web/lib/inventory/purchase-order-paths.ts");
  const inventoryPaths = read(
    "apps/web/app/(protected)/inventory/_lib/paths.ts",
  );
  const shim = read(
    "apps/web/app/(protected)/inventory/purchase-requests/page.tsx",
  );
  const newPage = read(
    "apps/web/app/(protected)/inventory/purchase-requests/new/page.tsx",
  );
  const ordersPage = read(
    "apps/web/app/(protected)/inventory/purchase-orders/page.tsx",
  );
  const demandList = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-list.tsx",
  );
  const demandClient = read(
    "apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
  );
  const branchPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/page.tsx",
  );
  const branchClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/branch-purchase-requests-client.tsx",
  );
  const actions = read(
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
  );

  assert.match(paths, /PURCHASE_ORDER_CREATE_HREF/);
  assert.match(
    paths,
    /\/inventory\/purchase-orders\?tab=orders&mode=create/,
  );
  assert.match(inventoryPaths, /PURCHASE_ORDER_CREATE_HREF/);

  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/inventory/purchase-requests/new/page.tsx",
      ),
    ),
    true,
  );
  assert.match(newPage, /PURCHASE_ORDER_CREATE_HREF/);
  assert.match(shim, /CREATE_MODES/);
  assert.match(shim, /redirect\(PURCHASE_ORDER_CREATE_HREF\)/);
  assert.match(shim, /redirect\("\/inventory\/purchase-orders"\)/);
  assert.doesNotMatch(shim, /params\.set\("tab", "needs"\)/);
  assert.doesNotMatch(shim, /create-po" \? "allocate"/);

  assert.doesNotMatch(ordersPage, /canCreateRequest/);
  assert.doesNotMatch(ordersPage, /canAllocate=\{false\}/);
  assert.doesNotMatch(ordersPage, /defaultTab = requestedTab === "needs"/);
  assert.match(ordersPage, /loadPurchaseOrderRows/);
  assert.doesNotMatch(ordersPage, /hasPendingDemand/);
  assert.match(demandClient, /canCreateRequest &&/);
  assert.match(demandClient, /canAllocate && mode === "allocate"/);
  assert.match(demandList, /canCreateRequest \? \(/);
  assert.match(branchPage, /redirect\(PURCHASE_ORDER_CREATE_HREF\)/);
  assert.match(branchPage, /redirect\(`\/br\/\$\{branchId\}\/stock`\)/);
  assert.doesNotMatch(branchPage, /canCreateRequest/);
  assert.match(branchPage, /PURCHASE_ORDER_CREATE_HREF/);
  assert.match(branchPage, /@lib\/inventory\/purchase-order-paths/);
  assert.match(branchClient, /canCreateRequest &&/);

  assert.match(actions, /export const savePurchaseDemand/);
  assert.match(actions, /export const reviewPurchaseDemand/);
  assert.match(actions, /ycmWriteFrozen/);
  assert.doesNotMatch(actions, /REVOKE/);
});

test("Wave 2 GRN list is warehouse-first and drops YCM plus warehouse HĐ chrome", () => {
  const listData = read("apps/web/lib/inventory/grn-list-data.ts");
  const listModel = read("apps/web/lib/inventory/grn-list-model.ts");
  const listClient = read(
    "apps/web/app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  const detailData = read("apps/web/lib/inventory/grn-detail-data.ts");
  const ordersClient = read(
    "apps/web/app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  const branchGrn = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  );
  const branchGrnNew = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/page.tsx",
  );
  const branchGrnNewSupplier = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/page.tsx",
  );

  assert.match(listModel, /: "draft"/);
  assert.match(listModel, /export function canShowGrnInvoiceChrome/);
  assert.match(listModel, /isBranchScopedProcurementRole/);
  assert.match(listData, /purchaseRequestId: null/);
  assert.match(listData, /canShowGrnInvoiceChrome\(claims\.user_role\)/);
  assert.doesNotMatch(
    listData,
    /purchaseRequestId: parsePositiveId\(params\.requestId\)/,
  );
  assert.match(listClient, /OWNER_UNPRICED_GRN_STATUS/);
  assert.match(listClient, /grnCopy\.confirmedUnitCost\.tab/);
  assert.match(listClient, /canManageSupplierInvoice &&/);
  assert.doesNotMatch(listClient, /requestId: filters\.purchaseRequestId/);
  assert.doesNotMatch(listClient, /header: "Yêu cầu mua"/);
  assert.match(detailData, /canShowGrnInvoiceChrome\(context\?\.claims\.user_role\)/);
  assert.doesNotMatch(ordersClient, /copy\.groupCode/);
  assert.match(branchGrn, /PURCHASE_ORDER_CREATE_HREF/);
  assert.match(branchGrn, /@lib\/inventory\/purchase-order-paths/);
  assert.match(branchGrn, /messages\.inventory\.po\.createAction/);
  assert.doesNotMatch(branchGrn, /@\/\(protected\)\/inventory\/_lib\/paths/);
  assert.doesNotMatch(branchGrn, /stock\/purchase-requests/);
  assert.match(branchGrnNew, /PURCHASE_ORDER_CREATE_HREF/);
  assert.match(branchGrnNewSupplier, /PURCHASE_ORDER_CREATE_HREF/);
  assert.doesNotMatch(branchGrnNew, /stock\/purchase-requests/);
  assert.doesNotMatch(branchGrnNewSupplier, /stock\/purchase-requests/);
});
