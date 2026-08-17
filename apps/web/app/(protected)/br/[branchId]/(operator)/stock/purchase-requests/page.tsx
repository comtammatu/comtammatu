import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { resolveBranchContext } from "@/_lib/branch-context";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import type { IngredientRow } from "@lib/inventory/types";
import { filterPurchasedIngredientRows } from "@lib/inventory/catalog-readiness";
import type { PurchaseRequestIngredientOption } from "@lib/inventory/purchase-request-model";
import {
  loadPurchaseDemandRows,
  loadPurchasePickerUnits,
} from "@lib/inventory/load-purchase-workspace";
import { loadSuggestedOrderQtyByIngredient } from "@lib/inventory/load-suggested-order-qty";
import { suggestedOrderQtyInEntryUnit } from "@lib/inventory/suggested-order-qty";
import { fetchProcurementBranches } from "@/(protected)/inventory/_lib/procurement-branches";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import type { PurchaseOrderSupplier } from "@/(protected)/inventory/purchase-requests/purchase-order-drafts";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { BranchPurchaseRequestsClient } from "./branch-purchase-requests-client";

export default async function OperatorPurchaseRequestsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock`);
  }

  const [
    procurementBranches,
    ingredientResult,
    canCreateRequest,
    canAllocate,
    supplierResult,
    supplierItemResult,
  ] = await Promise.all([
    fetchProcurementBranches(supabase, claims.tenant_id),
    fetchIngredients(2000, undefined, { includeUnits: false }),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE),
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
      <BranchOperatorPage title={messages.inventory.po.workspaceTitle}>
        <AppEmptyState
          mode="error"
          title={messages.inventory.po.loadErrorTitle}
          description={messages.inventory.po.loadErrorDescription}
        />
      </BranchOperatorPage>
    );
  }

  const branches = procurementBranches.map((branch) => ({
    id: branch.id,
    name: branch.name,
  }));
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const supplierNames = new Map(
    (supplierResult.data ?? []).map((supplier) => [supplier.id, supplier.name]),
  );
  const demandLoad = await loadPurchaseDemandRows({
    supabase,
    tenantId: claims.tenant_id,
    branchId,
    canAllocate,
    branchNames,
    supplierNames,
  });

  if (!demandLoad.success) {
    return (
      <BranchOperatorPage title={messages.inventory.po.workspaceTitle}>
        <AppEmptyState
          mode="error"
          title={messages.inventory.po.loadErrorTitle}
          description={messages.inventory.po.loadErrorDescription}
        />
      </BranchOperatorPage>
    );
  }

  const supplierMappings = supplierItemResult.data ?? [];
  const mappedIngredientIds = [
    ...new Set(supplierMappings.map((item) => item.ingredient_id)),
  ];
  const supplierIngredientIds = Object.groupBy(
    supplierMappings,
    (item) => String(item.supplier_id),
  );
  const suppliers: PurchaseOrderSupplier[] = canAllocate
    ? (supplierResult.data ?? []).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        ingredientIds: (
          supplierIngredientIds[String(supplier.id)] ?? []
        ).map((item) => item.ingredient_id),
        preferredIngredientIds: (
          supplierIngredientIds[String(supplier.id)] ?? []
        )
          .filter((item) => item.is_preferred)
          .map((item) => item.ingredient_id),
      }))
    : [];

  const demandRows = demandLoad.rows;

  const ingredientRows = filterPurchasedIngredientRows(
    (ingredientResult.data ?? []) as IngredientRow[],
  );
  const pickerUnits = await loadPurchasePickerUnits({
    supabase,
    tenantId: claims.tenant_id,
  });
  const suggestedByIngredient = await loadSuggestedOrderQtyByIngredient({
    supabase,
    tenantId: claims.tenant_id,
    branchId,
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

  const requestBranches = [
    { id: branchId, name: branchContext.branch.name },
  ];

  return (
    <BranchPurchaseRequestsClient
      rows={demandRows}
      branches={requestBranches}
      ingredients={ingredientOptions}
      suppliers={suppliers}
      mappedIngredientIds={mappedIngredientIds}
      canCreateRequest={canCreateRequest}
      canAllocate={canAllocate}
      branchId={branchId}
      branchName={branchContext.branch.name}
    />
  );
}
