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
  
  const { productionBranches, finishedGoods } = await loadProductionSurfaceData({ routeBranchId, includeRecipes: false });

  return (
    <AppPage width="narrow" density="compact">
      <AppPageHeader title="Tạo lệnh sản xuất mới" />
      <ProductionNewClient 
        branches={productionBranches}
        finishedGoods={finishedGoods}
        initialBranchId={routeBranchId}
        basePath="/inventory/production"
      />
    </AppPage>
  );
}
