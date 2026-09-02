import { loadStockOnHandPageData } from "@lib/inventory/stock-on-hand-data";
import { loadAuthState } from "@/_lib/auth";
import { StockClient } from "./stock-client";

interface StockPageProps {
  searchParams: Promise<{
    branch?: string | string[];
    location?: string | string[];
    ingredientId?: string | string[];
  }>;
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const rawIngredientId = Array.isArray(params.ingredientId)
    ? params.ingredientId[0]
    : params.ingredientId;
  const ingredientId = rawIngredientId ? parseInt(rawIngredientId, 10) : NaN;
  const rawLocationId = Array.isArray(params.location)
    ? params.location[0]
    : params.location;
  const requestedLocationId = rawLocationId ? Number(rawLocationId) : null;

  const {
    branchId,
    branchValue,
    coreDataLoadFailed,
    ingredients,
    locations,
    defaultLocationId,
    permissions,
    summary,
    totalValue,
  } = await loadStockOnHandPageData({
    queryBranch: params.branch,
  });
  const initialLocationId =
    rawLocationId === "total"
      ? null
      : locations.some((location) => location.id === requestedLocationId)
        ? requestedLocationId
        : defaultLocationId;

  let initialDetailData = null;
  if (!isNaN(ingredientId) && ingredientId > 0) {
    const { loadStockIngredientDetailData } =
      await import("@lib/inventory/stock-on-hand-detail-data");
    initialDetailData = await loadStockIngredientDetailData({
      ingredientId,
      queryBranch: params.branch,
    });
  }

  let branchThresholds: import("@lib/inventory/branch-thresholds-data").BranchStockThresholdRow[] =
    [];
  let reorderSuggestions: import("@lib/inventory/smart-reorder-data").ReorderSuggestionItem[] =
    [];
  let intraSiteTransferData: import("@lib/inventory/intra-site-transfer-data").IntraSiteTransferData | null =
    null;

  if (branchId != null && initialLocationId != null) {
    const [
      { loadBranchStockThresholdsData },
      { loadBranchReorderSuggestionsData },
    ] = await Promise.all([
      import("@lib/inventory/branch-thresholds-data"),
      import("@lib/inventory/smart-reorder-data"),
    ]);

    const [thresholdsRes, reorderRes] = await Promise.all([
      loadBranchStockThresholdsData(branchId, initialLocationId),
      loadBranchReorderSuggestionsData(branchId, initialLocationId),
    ]);
    branchThresholds = thresholdsRes.rows;
    reorderSuggestions = reorderRes.allItems;
  }

  if (branchId != null) {
    const { supabase, claims } = await loadAuthState();
    if (claims.user_role === "owner") {
      const { loadIntraSiteTransferData } =
        await import("@lib/inventory/intra-site-transfer-data");
      intraSiteTransferData = await loadIntraSiteTransferData({
        supabase,
        tenantId: claims.tenant_id,
        branchId,
      });
    }
  }

  return (
    <StockClient
      ingredients={ingredients}
      locations={locations}
      defaultLocationId={initialLocationId}
      branchId={branchId}
      branchValue={branchValue}
      coreDataLoadFailed={coreDataLoadFailed}
      totalValue={totalValue}
      summary={summary}
      permissions={permissions}
      initialIngredientId={
        !isNaN(ingredientId) && ingredientId > 0 ? ingredientId : null
      }
      initialDetailData={initialDetailData}
      branchThresholds={branchThresholds}
      reorderSuggestions={reorderSuggestions}
      intraSiteTransferData={intraSiteTransferData}
    />
  );
}
