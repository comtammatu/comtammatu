import { notFound } from "next/navigation";
import { NewStocktakeSessionPageContent } from "@/(protected)/inventory/stocktake/new/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorNewStocktakePage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <NewStocktakeSessionPageContent
      routeBranchId={branchId}
      routeBase={`/br/${branchId}/stock/stocktake`}
      embedded
    />
  );
}
