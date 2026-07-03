import { notFound } from "next/navigation";
import { SupplierReturnDetailPageContent } from "@/(protected)/inventory/supplier-returns/[id]/page";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorSupplierReturnDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const returnId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(returnId) ||
    returnId <= 0
  ) {
    notFound();
  }

  return (
    <SupplierReturnDetailPageContent
      returnId={returnId}
      routeBranchId={branchId}
      embedded
    />
  );
}
