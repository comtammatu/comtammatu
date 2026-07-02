import { notFound } from "next/navigation";
import { StockPageContent } from "@/(protected)/inventory/stock/page";

export default async function OperatorStockPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
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
