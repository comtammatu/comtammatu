import { notFound } from "next/navigation";
import { StocktakePageContent } from "@/(protected)/inventory/stocktake/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStocktakePage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <StocktakePageContent
      routeBranchId={branchId}
      routeBase={`/br/${branchId}/stock/stocktake`}
      embedded
    />
  );
}
