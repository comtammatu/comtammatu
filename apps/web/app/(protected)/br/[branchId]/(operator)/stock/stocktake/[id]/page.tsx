import { notFound } from "next/navigation";
import { StocktakeDetailPageContent } from "@/(protected)/inventory/stocktake/[id]/page";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
  searchParams: Promise<{ error?: string; view?: string }>;
}

export default async function OperatorStocktakeDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const stocktakeId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(stocktakeId) ||
    stocktakeId <= 0
  ) {
    notFound();
  }

  return (
    <StocktakeDetailPageContent
      stocktakeId={stocktakeId}
      searchParams={searchParams}
      routeBranchId={branchId}
      routeBase={`/br/${branchId}/stock/stocktake`}
      embedded
    />
  );
}
