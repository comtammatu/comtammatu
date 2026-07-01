import { notFound } from "next/navigation";
import { TransfersPageContent } from "@/(protected)/inventory/transfers/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockTransferPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <TransfersPageContent
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/transfer`}
      initialTab="dispatch"
      embedded
    />
  );
}
