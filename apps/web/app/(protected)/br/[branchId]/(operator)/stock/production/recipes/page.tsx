import { notFound } from "next/navigation";
import { AppEmptyState } from "@/components/surface";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { messages } from "@lib/messages";
import { BranchProductionRecipesClient } from "./branch-production-recipes-client";

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
        title={messages.inventory.operatorFlow.productionRecipeLoadFailed}
        description={data.recipeLoadError}
      />
    );
  }

  return (
    <BranchProductionRecipesClient
      branchId={branchId}
      canManageRecipes={data.canManageRecipes}
      finishedGoods={data.finishedGoods}
      recipes={data.recipes}
    />
  );
}
