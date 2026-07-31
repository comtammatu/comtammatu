import { notFound, redirect } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadAuthState } from "@/_lib/auth";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { BranchProductionNewClient } from "./branch-production-new-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionNewPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock`);
  }

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
