import { redirect } from "next/navigation";
import { loadProductionSurfaceData } from "../production-data";
import { ProductionHubClient } from "../production-client";

interface ProductionPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  embedded?: boolean;
}

/**
 * `basePath` is accepted for shell-contract parity with the other
 * `*PageContent` exports (`docs/spec/page-archetypes.md`), but the
 * production hub has no nested detail routes today — orders/recipes are
 * managed inline via dialogs, not navigation — so it is not threaded
 * further.
 */
export async function ProductionPageContent({
  routeBranchId,
  embedded = false,
}: ProductionPageContentProps) {
  const {
    canManageCatalog,
    canManageRecipes,
    canCreateProduction,
    canConfirmProduction,
    canAdjustStock,
    productionBranches,
    unitOptions,
    ingredients,
    finishedGoods,
    orders,
    recipes,
  } = await loadProductionSurfaceData({ routeBranchId });

  return (
    <ProductionHubClient
      canManageCatalog={canManageCatalog}
      canManageRecipes={canManageRecipes}
      canCreateProduction={canCreateProduction}
      canConfirmProduction={canConfirmProduction}
      canAdjustStock={canAdjustStock}
      productionBranches={productionBranches}
      unitOptions={unitOptions}
      ingredients={ingredients}
      finishedGoods={finishedGoods}
      orders={orders}
      recipes={recipes}
      embedded={embedded}
    />
  );
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams?: Promise<{ branchId?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const qParams = new URLSearchParams();
  qParams.set("tab", "production");
  if (params.branchId) {
    if (Array.isArray(params.branchId)) {
      params.branchId.forEach((id) => qParams.append("branchId", id));
    } else {
      qParams.set("branchId", params.branchId);
    }
  }
  redirect(`/inventory/operations?${qParams.toString()}`);
}
