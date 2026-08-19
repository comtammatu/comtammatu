import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { messages } from "@lib/messages";
import type { IngredientRow } from "@lib/inventory/types";
import { filterPurchasedIngredientRows } from "@lib/inventory/catalog-readiness";
import { loadSuggestedOrderQtyByIngredient } from "@lib/inventory/load-suggested-order-qty";
import { suggestedOrderQtyInEntryUnit } from "@lib/inventory/suggested-order-qty";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import {
  loadPurchaseDemandRows,
  loadPurchaseOrderRows,
  loadPurchasePickerUnits,
} from "@lib/inventory/load-purchase-workspace";
import { fetchIngredients } from "../ingredient-actions";
import { PurchaseRequestsClient } from "../purchase-requests/purchase-requests-client";
import type { PurchaseRequestIngredientOption } from "@lib/inventory/purchase-request-model";
import type { PurchaseOrderSupplier } from "../purchase-requests/purchase-order-drafts";
import { PurchaseOrdersClient } from "./purchase-orders-client";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string | string[];
    branch?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranch: params.branch,
  });
  if (scope.outOfScope) notFound();

  const [
    procurementBranches,
    ingredientResult,
    canAllocate,
    canManagePo,
    canReceive,
    supplierResult,
    supplierItemResult,
  ] = await Promise.all([
    fetchProcurementBranches(supabase, claims.tenant_id),
    fetchIngredients(2000, undefined, { includeUnits: false }),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("supplier_items")
      .select("supplier_id, ingredient_id, is_preferred")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true),
  ]);

  if (
    supplierResult.error ||
    supplierItemResult.error ||
    !ingredientResult.success
  ) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={messages.inventory.po.workspaceTitle} />
        <AppEmptyState
          mode="error"
          title={messages.inventory.po.loadErrorTitle}
          description={messages.inventory.po.loadErrorDescription}
        />
      </AppPage>
    );
  }

  const branches = procurementBranches.map((branch) => ({
    id: branch.id,
    name: branch.name,
  }));
  const branchNames = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );
  const supplierNames = new Map(
    (supplierResult.data ?? []).map((supplier) => [supplier.id, supplier.name]),
  );
  const [demandLoad, poLoad] = await Promise.all([
    loadPurchaseDemandRows({
      supabase,
      tenantId: claims.tenant_id,
      branchId: scope.selectedBranchId,
      canAllocate,
      branchNames,
      supplierNames,
    }),
    loadPurchaseOrderRows({
      supabase,
      tenantId: claims.tenant_id,
      branchId: scope.selectedBranchId,
      branchNames,
      supplierNames,
    }),
  ]);

  if (!demandLoad.success || !poLoad.success) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={messages.inventory.po.workspaceTitle} />
        <AppEmptyState
          mode="error"
          title={messages.inventory.po.loadErrorTitle}
          description={messages.inventory.po.loadErrorDescription}
        />
      </AppPage>
    );
  }

  const activeSupplierIds = new Set(
    (supplierResult.data ?? []).map((supplier) => supplier.id),
  );
  const supplierMappings = (supplierItemResult.data ?? []).filter((item) =>
    activeSupplierIds.has(item.supplier_id),
  );
  const mappedIngredientIds = [
    ...new Set(supplierMappings.map((item) => item.ingredient_id)),
  ];
  const supplierIngredientIds = Object.groupBy(supplierMappings, (item) =>
    String(item.supplier_id),
  );
  const suppliers: PurchaseOrderSupplier[] =
    canAllocate || canManagePo
      ? (supplierResult.data ?? []).map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          ingredientIds: (supplierIngredientIds[String(supplier.id)] ?? []).map(
            (item) => item.ingredient_id,
          ),
          preferredIngredientIds: (
            supplierIngredientIds[String(supplier.id)] ?? []
          )
            .filter((item) => item.is_preferred)
            .map((item) => item.ingredient_id),
        }))
      : [];

  const demandRows = demandLoad.rows;
  const poRows = poLoad.rows;

  const ingredientRows = filterPurchasedIngredientRows(
    (ingredientResult.data ?? []) as IngredientRow[],
  );
  const pickerUnits = await loadPurchasePickerUnits({
    supabase,
    tenantId: claims.tenant_id,
  });
  const suggestedByIngredient =
    scope.selectedBranchId == null
      ? new Map<number, number>()
      : await loadSuggestedOrderQtyByIngredient({
          supabase,
          tenantId: claims.tenant_id,
          branchId: scope.selectedBranchId,
          ingredientIds: ingredientRows.map((ingredient) => ingredient.id),
          minStockByIngredient: new Map(
            ingredientRows.map((ingredient) => [
              ingredient.id,
              ingredient.min_stock_level,
            ]),
          ),
        });
  const ingredientOptions: PurchaseRequestIngredientOption[] =
    ingredientRows.map((ingredient) => {
      const units = pickerUnits.get(ingredient.id) ?? [];
      const defaultUnit = units.reduce<
        (typeof units)[number] | undefined
      >(
        (selected, unit) =>
          selected == null || unit.factor > selected.factor ? unit : selected,
        undefined,
      );
      return {
        id: ingredient.id,
        name: ingredient.name,
        suggestedOrderQty: suggestedOrderQtyInEntryUnit(
          suggestedByIngredient.get(ingredient.id) ?? 0,
          defaultUnit?.factor ?? 1,
        ),
        units,
      };
    });
  const requestBranches =
    claims.user_role === "owner"
      ? branches
      : branches.filter((branch) => branch.id === claims.branch_id);
  const createBranches =
    claims.user_role === "owner" || claims.user_role === "accountant"
      ? branches
      : branches.filter((branch) => branch.id === claims.branch_id);
  const requestedTab = firstParam(params.tab);
  const defaultTab = requestedTab === "needs" ? "needs" : "orders";

  const needsContent = (
    <PurchaseRequestsClient
      rows={demandRows}
      branches={requestBranches}
      ingredients={ingredientOptions}
      suppliers={suppliers}
      mappedIngredientIds={mappedIngredientIds}
      canCreateRequest={false}
      canAllocate={canAllocate}
    />
  );
  const ordersContent = (
    <PurchaseOrdersClient
      rows={poRows}
      branches={branches}
      createBranches={createBranches}
      suppliers={suppliers}
      ingredients={ingredientOptions}
      canManage={canManagePo || canAllocate}
      canReceive={canReceive}
      canCreate={canManagePo && createBranches.length > 0}
    />
  );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={messages.inventory.po.workspaceTitle}
        description={messages.inventory.po.workspaceDescription}
      />
      <AppPageTabs
        items={[
          {
            value: "needs",
            label: messages.inventory.po.needsTab,
            count: demandRows.filter((row) =>
              ["submitted", "pending_allocation", "partially_ordered"].includes(
                row.status,
              ),
            ).length,
          },
          {
            value: "orders",
            label: messages.inventory.po.ordersTab,
            count: poRows.length,
          },
        ]}
        defaultValue={defaultTab}
        ariaLabel={messages.inventory.po.workspaceTabsAria}
        queryKeysByValue={{
          needs: [
            "demandId",
            "needsQ",
            "needsStatus",
            "needsSite",
            "needsPage",
            "branch",
          ],
          orders: [
            "poId",
            "ordersQ",
            "ordersStatus",
            "ordersSite",
            "ordersPage",
            "branch",
          ],
        }}
      >
        <TabsContent value="needs" className="mt-0">
          {needsContent}
        </TabsContent>
        <TabsContent value="orders" className="mt-0">
          {ordersContent}
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
