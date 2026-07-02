import { notFound } from "next/navigation";
import { TransferDetailPageContent } from "@/(protected)/inventory/transfers/[id]/page";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorStockReceiveDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const transferId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(transferId) ||
    transferId <= 0
  ) {
    notFound();
  }

  return (
    <TransferDetailPageContent
      transferId={transferId}
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/receive`}
    />
  );
}
