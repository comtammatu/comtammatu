import { notFound } from "next/navigation";
import { BranchSupplierReturnCreateClient } from "./branch-supplier-return-create-client";
import { loadBranchSupplierReturnCreateData } from "@lib/inventory/branch-supplier-return-data";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorSupplierReturnNewPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadBranchSupplierReturnCreateData(branchId);

  return <BranchSupplierReturnCreateClient {...data} />;
}
