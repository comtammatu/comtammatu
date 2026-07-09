import { loadStockOnHandPageData } from "@lib/inventory/stock-on-hand-data";
import { StockClient } from "./stock-client";

interface StockPageProps {
  searchParams: Promise<{ branchId?: string | string[] }>;
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const {
    branchId,
    branchValue,
    coreDataLoadFailed,
    ingredients,
    permissions,
    summary,
    totalValue,
  } = await loadStockOnHandPageData({
    queryBranchId: params.branchId,
  });

  return (
    <StockClient
      ingredients={ingredients}
      branchId={branchId}
      branchValue={branchValue}
      coreDataLoadFailed={coreDataLoadFailed}
      totalValue={totalValue}
      summary={summary}
      permissions={permissions}
    />
  );
}
