import { notFound } from "next/navigation";
import { GRNListPageContent } from "@/(protected)/inventory/grn/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}

export default async function OperatorStockGrnPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <GRNListPageContent
      searchParams={searchParams}
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/grn`}
      purchaseOrdersPath={`/br/${branchId}/stock/purchase-orders`}
      showDrafts={false}
      embedded
    />
  );
}
