/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchProductionRuns, type ProductionRunRow } from "../production-run-actions";
import { ProductionRunsClient } from "./production-runs-client";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { loadProductionSurfaceData } from "../production-data";
import { ProductionRecipePanel } from "../production-recipe-panel";

interface ProductionPageProps {
  searchParams?: Promise<{ branchId?: string | string[], tab?: string }>;
  routeBranchId?: number;
  embedded?: boolean;
}

export async function ProductionPageContent({
  searchParams,
  routeBranchId,
  embedded = false,
}: ProductionPageProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  
  if (scope.outOfScope) notFound();

  const activeTab = params.tab === "recipes" ? "recipes" : "runs";

  const [res, surfaceData] = await Promise.all([
    fetchProductionRuns(),
    loadProductionSurfaceData({ routeBranchId }),
  ]);
  const rows: ProductionRunRow[] = res.success ? (res.data as ProductionRunRow[]) : [];

  const runsContent = (
    <ProductionRunsClient
      initial={rows}
      branchId={scope.selectedBranchId ?? undefined}
      basePath="/inventory/production"
      embedded={embedded}
    />
  );

  const recipesContent = surfaceData.recipeLoadError ? (
    <AppEmptyState
      mode="error"
      title="Không thể tải công thức sản xuất"
      description={surfaceData.recipeLoadError}
    />
  ) : (
    <ProductionRecipePanel
      canManageCatalog={surfaceData.canManageCatalog}
      canManageRecipes={surfaceData.canManageRecipes}
      finishedGoods={surfaceData.finishedGoods}
      unitOptions={surfaceData.unitOptions}
      ingredients={surfaceData.ingredients}
      recipes={surfaceData.recipes}
      embedded={embedded}
    />
  );

  if (embedded) {
    return activeTab === "recipes" ? recipesContent : runsContent;
  }

  const tabsList = [
    { value: "runs", label: "Lệnh sản xuất" },
    { value: "recipes", label: "Công thức" },
  ];

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader title="Sản xuất Bếp Trung Tâm" />
      <AppPageTabs items={tabsList} defaultValue={activeTab}>
        <TabsContent value="runs" className="mt-0">
          {runsContent}
        </TabsContent>
        <TabsContent value="recipes" className="mt-0">
          {recipesContent}
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[], tab?: string }>;
}) {
  return <ProductionPageContent searchParams={searchParams} />;
}
