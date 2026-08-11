import { loadStockOnHandPageData } from "@lib/inventory/stock-on-hand-data";
import { StockClient } from "./stock-client";

interface StockPageProps {
  searchParams: Promise<{
    branch?: string | string[];
    ingredientId?: string | string[];
  }>;
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const rawIngredientId = Array.isArray(params.ingredientId)
    ? params.ingredientId[0]
    : params.ingredientId;
  const ingredientId = rawIngredientId ? parseInt(rawIngredientId, 10) : NaN;

  const {
    branchId,
    branchValue,
    coreDataLoadFailed,
    ingredients,
    permissions,
    summary,
    totalValue,
  } = await loadStockOnHandPageData({
    queryBranch: params.branch,
  });

  let initialDetailData = null;
  if (!isNaN(ingredientId) && ingredientId > 0) {
    const { loadStockIngredientDetailData } = await import(
      "@lib/inventory/stock-on-hand-detail-data"
    );
    initialDetailData = await loadStockIngredientDetailData({
      ingredientId,
      queryBranch: params.branch,
    });
  }

  return (
    <StockClient
      ingredients={ingredients}
      branchId={branchId}
      branchValue={branchValue}
      coreDataLoadFailed={coreDataLoadFailed}
      totalValue={totalValue}
      summary={summary}
      permissions={permissions}
      initialIngredientId={!isNaN(ingredientId) && ingredientId > 0 ? ingredientId : null}
      initialDetailData={initialDetailData}
    />
  );
}
