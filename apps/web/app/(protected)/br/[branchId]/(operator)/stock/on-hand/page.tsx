import { notFound } from "next/navigation";
import { StockPageContent } from "@/(protected)/inventory/stock/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockOnHandPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <StockPageContent
      routeBranchId={branchId}
      branchStockBasePath={`/br/${branchId}/stock`}
      embedded
    />
  );
}
