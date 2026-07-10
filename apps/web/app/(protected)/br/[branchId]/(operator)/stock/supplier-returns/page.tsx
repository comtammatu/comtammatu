import { notFound } from "next/navigation";
import { BranchSupplierReturnsListClient } from "./branch-supplier-returns-list-client";
import { loadBranchSupplierReturnListData } from "@lib/inventory/branch-supplier-return-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorSupplierReturnsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchSupplierReturnListData(branchId);

  return <BranchSupplierReturnsListClient {...data} />;
}
