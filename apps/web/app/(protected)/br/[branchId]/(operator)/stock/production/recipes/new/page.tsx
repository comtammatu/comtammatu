import { notFound, redirect } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { BranchProductionRecipeEditorClient } from "../branch-production-recipe-editor-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionRecipeNewPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadProductionSurfaceData({ routeBranchId: branchId });
  if (!data.canManageRecipes) {
    redirect("/access-denied?reason=insufficient-permission");
  }
  const usedFinishedGoodIds = Array.from(
    new Set(data.recipes.map((recipe) => recipe.finished_good_id)),
  );

  return (
    <BranchProductionRecipeEditorClient
      branchId={branchId}
      canManageRecipes={data.canManageRecipes}
      finishedGoods={data.finishedGoods}
      ingredients={data.ingredients}
      usedFinishedGoodIds={usedFinishedGoodIds}
      initialRecipes={[]}
    />
  );
}
