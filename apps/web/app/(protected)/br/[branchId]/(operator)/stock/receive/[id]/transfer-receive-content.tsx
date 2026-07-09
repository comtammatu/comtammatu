import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { TransferReceiveClient } from "./transfer-receive-client";

interface TransferReceiveContentProps {
  transferId: number;
  branchId: number;
}

export async function TransferReceiveContent({
  transferId,
  branchId,
}: TransferReceiveContentProps) {
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
