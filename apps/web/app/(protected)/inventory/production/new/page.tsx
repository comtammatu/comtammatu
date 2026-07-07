/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { loadProductionSurfaceData } from "../../production-data";
import { ProductionNewClient } from "./production-new-client";
import { AppPage, AppPageHeader } from "@/components/surface";

export default async function ProductionNewPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const params = await searchParams;
  const routeBranchId = params.branchId ? parseInt(params.branchId, 10) : undefined;
  
  const {
    productionBranches,
    targetBranches,
    finishedGoods,
    recipes,
  } = await loadProductionSurfaceData({ routeBranchId });
  const recipeFinishedGoodIds = new Set(
    recipes.map((recipe) => recipe.finished_good_id),
  );
  const finishedGoodsWithRecipes = finishedGoods.filter((good) =>
    recipeFinishedGoodIds.has(good.id),
  );

  return (
    <AppPage width="narrow" density="compact">
      <AppPageHeader title="Tạo lệnh sản xuất mới" />
      <ProductionNewClient 
        branches={productionBranches}
        targetBranches={targetBranches}
        finishedGoods={finishedGoodsWithRecipes}
        initialBranchId={routeBranchId}
        basePath="/inventory/production"
      />
    </AppPage>
  );
}
