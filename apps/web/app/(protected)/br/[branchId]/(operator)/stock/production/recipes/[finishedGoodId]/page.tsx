import { notFound } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { BranchProductionRecipeEditorClient } from "../branch-production-recipe-editor-client";

interface PageProps {
  params: Promise<{ branchId: string; finishedGoodId: string }>;
}

export default async function OperatorProductionRecipeDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, finishedGoodId: rawFinishedGoodId } =
    await params;
  const branchId = Number(rawBranchId);
  const finishedGoodId = Number(rawFinishedGoodId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(finishedGoodId) ||
    finishedGoodId <= 0
  ) {
    notFound();
  }

  const data = await loadProductionSurfaceData({ routeBranchId: branchId });
  const hasRecipe = data.recipes.some(
    (recipe) => recipe.finished_good_id === finishedGoodId,
  );
  const hasFinishedGood = data.finishedGoods.some(
    (finishedGood) => finishedGood.id === finishedGoodId,
  );
  if (!hasRecipe || !hasFinishedGood) notFound();
  const selectedFinishedGoods = data.finishedGoods.filter(
    (finishedGood) => finishedGood.id === finishedGoodId,
  );
  const initialRecipes = data.recipes.filter(
    (recipe) => recipe.finished_good_id === finishedGoodId,
  );

  return (
    <BranchProductionRecipeEditorClient
      branchId={branchId}
      canManageRecipes={data.canManageRecipes}
      finishedGoods={selectedFinishedGoods}
      ingredients={data.ingredients}
      usedFinishedGoodIds={[finishedGoodId]}
      initialRecipes={initialRecipes}
      finishedGoodId={finishedGoodId}
    />
  );
}
