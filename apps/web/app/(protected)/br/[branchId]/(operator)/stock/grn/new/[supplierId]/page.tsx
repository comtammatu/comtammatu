import { notFound } from "next/navigation";
import { GrnCreatePageContent } from "@/(protected)/inventory/grn/new/[supplierId]/page";

interface PageProps {
  params: Promise<{ branchId: string; supplierId: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}

export default async function OperatorStockGrnCreatePage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId, supplierId: rawSupplierId } = await params;
  const branchId = Number(rawBranchId);
  const supplierId = Number(rawSupplierId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(supplierId) ||
    supplierId <= 0
  ) {
    notFound();
  }

  return (
    <GrnCreatePageContent
      supplierId={supplierId}
      searchParams={searchParams}
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/grn/new`}
      grnBasePath={`/br/${branchId}/stock/grn`}
      embedded
    />
  );
}
