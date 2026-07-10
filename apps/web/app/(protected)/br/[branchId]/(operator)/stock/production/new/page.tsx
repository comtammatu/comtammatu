import { notFound } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { BranchProductionNewClient } from "./branch-production-new-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionNewPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { productionBranches, locations, finishedGoods, recipes } =
    await loadProductionSurfaceData({ routeBranchId: branchId });
  const recipeFinishedGoodIds = new Set(
    recipes.map((recipe) => recipe.finished_good_id),
  );
  const finishedGoodsWithRecipes = finishedGoods.filter((good) =>
    recipeFinishedGoodIds.has(good.id),
  );

  return (
    <BranchProductionNewClient
      branchId={branchId}
      branches={productionBranches.filter((branch) => branch.id === branchId)}
      locations={locations}
      finishedGoods={finishedGoodsWithRecipes}
      basePath={`/br/${branchId}/stock/production`}
    />
  );
}
