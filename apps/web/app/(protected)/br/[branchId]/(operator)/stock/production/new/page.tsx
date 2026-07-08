import { notFound } from "next/navigation";
import { ProductionNewClient } from "@/(protected)/inventory/production/new/production-new-client";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionNewPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { productionBranches, targetBranches, finishedGoods, recipes } =
    await loadProductionSurfaceData({ routeBranchId: branchId });
  const recipeFinishedGoodIds = new Set(
    recipes.map((recipe) => recipe.finished_good_id),
  );
  const finishedGoodsWithRecipes = finishedGoods.filter((good) =>
    recipeFinishedGoodIds.has(good.id),
  );

  return (
    <ProductionNewClient
      branches={productionBranches.filter((branch) => branch.id === branchId)}
      targetBranches={targetBranches}
      finishedGoods={finishedGoodsWithRecipes}
      initialBranchId={branchId}
      basePath={`/br/${branchId}/stock/production`}
      embedded
    />
  );
}
