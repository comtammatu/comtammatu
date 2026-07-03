import { notFound } from "next/navigation";
import { SupplierReturnNewPageContent } from "@/(protected)/inventory/supplier-returns/new/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorSupplierReturnNewPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <SupplierReturnNewPageContent embedded />;
}
