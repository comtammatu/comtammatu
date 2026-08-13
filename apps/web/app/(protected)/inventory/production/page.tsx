import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchProductionRuns } from "../production-run-actions";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { AppPage } from "@/components/surface";
import { loadProductionSurfaceData } from "../production-data";
import { ProductionWorkspaceClient } from "./production-workspace-client";

interface ProductionPageProps {
  searchParams?: Promise<{ branch?: string | string[]; tab?: string }>;
  routeBranchId?: number;
}

export async function ProductionPageContent({
  searchParams,
  routeBranchId,
}: ProductionPageProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranch: params.branch,
  });

  if (scope.outOfScope) notFound();

  const activeTab = params.tab === "recipes" ? "recipes" : "runs";

  const [res, surfaceData] = await Promise.all([
    fetchProductionRuns(),
    loadProductionSurfaceData({ routeBranchId }),
  ]);
  if (!res.success) {
    throw new Error("inventory.production.load_failed");
  }

  return (
    <AppPage width="xwide" density="compact">
      <ProductionWorkspaceClient
        activeTab={activeTab}
        canCreateProduction={surfaceData.canCreateProduction}
        canManageRecipes={surfaceData.canManageRecipes}
        canManageCatalog={surfaceData.canManageCatalog}
        runs={res.data ?? []}
        recipes={surfaceData.recipes}
        recipeLoadError={surfaceData.recipeLoadError}
        finishedGoods={surfaceData.finishedGoods}
        unitOptions={surfaceData.unitOptions}
        ingredients={surfaceData.ingredients}
        productionBranches={surfaceData.productionBranches}
        locations={surfaceData.locations}
        selectedBranchId={scope.selectedBranchId ?? undefined}
      />
    </AppPage>
  );
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[]; tab?: string }>;
}) {
  return <ProductionPageContent searchParams={searchParams} />;
}
