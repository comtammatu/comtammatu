import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import type { IngredientRow } from "@lib/inventory/types";
import { filterPurchasedIngredientRows } from "@lib/inventory/catalog-readiness";
import { loadSuggestedOrderQtyByIngredient } from "@lib/inventory/load-suggested-order-qty";
import { suggestedOrderQtyInEntryUnit } from "@lib/inventory/suggested-order-qty";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import {
  loadPurchaseOrderRows,
  loadPurchasePickerUnits,
} from "@lib/inventory/load-purchase-workspace";
import { fetchIngredients } from "../ingredient-actions";
import type { PurchaseRequestIngredientOption } from "@lib/inventory/purchase-request-model";
import type { PurchaseOrderSupplier } from "@lib/inventory/purchase-order-drafts";
import { PurchaseOrdersClient } from "./purchase-orders-client";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
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
  const poLoad = await loadPurchaseOrderRows({
    supabase,
    tenantId: claims.tenant_id,
    branchId: scope.selectedBranchId,
    branchNames,
    supplierNames,
  });

  if (!poLoad.success) {
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
  const createBranches =
    claims.user_role === "owner" || claims.user_role === "accountant"
      ? branches
      : branches.filter((branch) => branch.id === claims.branch_id);

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={messages.inventory.po.workspaceTitle}
        description={messages.inventory.po.workspaceDescription}
      />
      <PurchaseOrdersClient
        rows={poLoad.rows}
        branches={branches}
        createBranches={createBranches}
        suppliers={suppliers}
        ingredients={ingredientOptions}
        canManage={canManagePo || canAllocate}
        canReceive={canReceive}
        canCreate={canManagePo && createBranches.length > 0}
      />
    </AppPage>
  );
}
