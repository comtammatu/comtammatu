import { notFound } from "next/navigation";
import { GRNDetailPageContent } from "@/(protected)/inventory/grn/[id]/page";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorStockReceiveDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const grnId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(grnId) ||
    grnId <= 0
  ) {
    notFound();
  }

  return (
    <GRNDetailPageContent
      grnId={grnId}
      routeBranchId={branchId}
      grnListBasePath={`/br/${branchId}/stock/receive`}
      grnMobileBackPath={`/br/${branchId}/stock/receive`}
      purchaseOrdersBasePath={`/br/${branchId}/stock/purchase-orders`}
    />
  );
}
