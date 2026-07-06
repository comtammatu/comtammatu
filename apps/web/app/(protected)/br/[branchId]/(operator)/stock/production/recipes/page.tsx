import { notFound } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { ProductionRecipePanel } from "@/(protected)/inventory/production-recipe-panel";

export default async function OperatorProductionRecipesPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadProductionSurfaceData({ routeBranchId: branchId });
  if (!data.canManageRecipes) notFound();

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
