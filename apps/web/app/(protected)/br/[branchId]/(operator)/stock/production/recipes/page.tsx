/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { notFound } from "next/navigation";
import { AppEmptyState } from "@/components/surface";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { ProductionRecipePanel } from "@/(protected)/inventory/production-recipe-panel";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionRecipesPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadProductionSurfaceData({ routeBranchId: branchId });

  if (data.recipeLoadError) {
    return (
      <AppEmptyState
        mode="error"
        title="Không thể tải công thức sản xuất"
        description={data.recipeLoadError}
      />
    );
  }

  return (
    <ProductionRecipePanel
      canManageCatalog={data.canManageCatalog}
      canManageRecipes={data.canManageRecipes}
      finishedGoods={data.finishedGoods}
      unitOptions={data.unitOptions}
      ingredients={data.ingredients}
      recipes={data.recipes}
      backHref={`/br/${branchId}/stock/production`}
      embedded
    />
  );
}
