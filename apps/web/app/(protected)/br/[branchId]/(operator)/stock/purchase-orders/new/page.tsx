import { notFound } from "next/navigation";
import { NewPurchaseOrderPageContent } from "@/(protected)/inventory/purchase-orders/new/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorNewPurchaseOrderPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <NewPurchaseOrderPageContent
      routeBranchId={branchId}
      poBasePath={`/br/${branchId}/stock/purchase-orders`}
    />
  );
}
