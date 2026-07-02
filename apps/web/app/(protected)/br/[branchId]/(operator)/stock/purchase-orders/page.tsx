import { notFound } from "next/navigation";
import { PurchaseOrdersPageContent } from "@/(protected)/inventory/purchase-orders/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorPurchaseOrdersPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <PurchaseOrdersPageContent
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/purchase-orders`}
      suppliersPath={null}
      embedded
    />
  );
}
