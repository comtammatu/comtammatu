import { notFound } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { ProductionOperatorClient } from "./production-operator-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadProductionSurfaceData({ routeBranchId: branchId });
  const scopedRuns = data.runs.filter(
    (run) => run.branch_id === branchId || run.target_branch_id === branchId,
  );

  return (
    <ProductionOperatorClient
      branchId={branchId}
      canCreateProduction={data.canCreateProduction}
      finishedGoodsCount={data.finishedGoods.length}
      recipesCount={
        new Set(data.recipes.map((recipe) => recipe.finished_good_id)).size
      }
      runs={scopedRuns}
    />
  );
}
