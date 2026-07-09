/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { loadProductionSurfaceData } from "../../production-data";
import { ProductionNewClient } from "./production-new-client";
import { AppPage, AppPageHeader } from "@/components/surface";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

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
    targetBranches,
    locations,
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
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={INVENTORY_VI.warehouse}
        title="Tạo lệnh sản xuất mới"
        description={INVENTORY_VI.productionOrdersCardDescription}
      />
      <ProductionNewClient
        branches={productionBranches}
        targetBranches={targetBranches}
        locations={locations}
        finishedGoods={finishedGoodsWithRecipes}
        initialBranchId={routeBranchId}
        basePath="/inventory/production"
      />
    </AppPage>
  );
}
