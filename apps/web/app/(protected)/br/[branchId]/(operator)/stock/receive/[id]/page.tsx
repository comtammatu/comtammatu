import { notFound } from "next/navigation";
import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { TransferReceiveClient } from "./transfer-receive-client";

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

  const data = await loadTransferDetailPageData({
    transferId,
    routeBranchId: branchId,
    includeAudit: false,
    includeCorrections: false,
  });

  return (
    <TransferReceiveClient
      transfer={data.transfer}
      backHref={`/br/${branchId}/stock/transfer?queue=receive`}
      detailHref={`/br/${branchId}/stock/transfer/${transferId}`}
    />
  );
}
