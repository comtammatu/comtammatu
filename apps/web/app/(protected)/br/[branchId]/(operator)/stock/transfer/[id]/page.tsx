import { notFound } from "next/navigation";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { messages } from "@lib/messages";
import { BranchTransferDetailClient } from "./branch-transfer-detail-client";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorTransferDetailPage({
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
  const copy = messages.inventory.transfer;
  const statusBadge = getStatusBadgeMeta("inventory", data.transfer.status);
  const listHref = `/br/${branchId}/stock/receive`;

  return (
    <BranchOperatorPage
      title={data.transfer.code}
      description={copy.routeMeta(
        data.transfer.fromLocation,
        data.transfer.toLocation,
        data.transfer.date,
      )}
      badge={{
        children: statusBadge.label,
        variant: statusBadge.variant,
      }}
      backHref={listHref}
      backLabel={copy.receiveNative.receiveBackToList}
    >
      <BranchTransferDetailClient
        branchId={branchId}
        transfer={data.transfer}
        userRole={data.userRole}
        userBranchId={data.userBranchId}
      />
    </BranchOperatorPage>
  );
}
