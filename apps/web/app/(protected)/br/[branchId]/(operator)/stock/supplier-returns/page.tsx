import { notFound } from "next/navigation";
import { SupplierReturnsPageContent } from "@/(protected)/inventory/supplier-returns/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorSupplierReturnsPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <SupplierReturnsPageContent
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/supplier-returns`}
      embedded
    />
  );
}
