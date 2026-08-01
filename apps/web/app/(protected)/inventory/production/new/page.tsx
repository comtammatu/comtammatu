import { loadProductionSurfaceData } from "../../production-data";
import { ProductionNewClient } from "./production-new-client";

export default async function ProductionNewPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const params = await searchParams;
  const routeBranchId = params.branchId
    ? Number.parseInt(params.branchId, 10)
    : undefined;

  const {
    productionBranches,
    locations,
    finishedGoods,
  } = await loadProductionSurfaceData({ routeBranchId });
  const finishedGoodsWithRecipes = finishedGoods.filter(
    (good) => good.recipeStatus === "active" && good.recipeSpecId != null,
  );

  return (
    <ProductionNewClient
      branches={productionBranches}
      locations={locations}
      finishedGoods={finishedGoodsWithRecipes}
      initialBranchId={routeBranchId}
      basePath="/inventory/production"
    />
  );
}
