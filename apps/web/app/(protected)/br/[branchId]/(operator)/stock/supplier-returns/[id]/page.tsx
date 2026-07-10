import { notFound } from "next/navigation";
import { BranchSupplierReturnDetailClient } from "./branch-supplier-return-detail-client";
import { loadBranchSupplierReturnDetailData } from "@lib/inventory/branch-supplier-return-data";

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

  const data = await loadBranchSupplierReturnDetailData(returnId, branchId);

  return <BranchSupplierReturnDetailClient branchId={branchId} data={data} />;
}
