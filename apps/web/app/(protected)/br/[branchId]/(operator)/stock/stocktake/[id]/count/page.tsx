import { notFound } from "next/navigation";
import { StocktakeCountPageContent } from "@/(protected)/inventory/stocktake/[id]/count/page";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorStocktakeCountPage({
  params,
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
    <StocktakeCountPageContent
      stocktakeId={stocktakeId}
      routeBranchId={branchId}
      routeBase={`/br/${branchId}/stock/stocktake`}
      embedded
    />
  );
}
