import { notFound } from "next/navigation";
import { PODetailPageContent } from "@/(protected)/inventory/purchase-orders/[id]/page";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorPurchaseOrderDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const poId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(poId) ||
    poId <= 0
  ) {
    notFound();
  }

  return (
    <PODetailPageContent
      poId={poId}
      routeBranchId={branchId}
      purchaseOrdersBasePath={`/br/${branchId}/stock/purchase-orders`}
      afterCreateGrnHref={`/br/${branchId}/stock/receive`}
    />
  );
}
