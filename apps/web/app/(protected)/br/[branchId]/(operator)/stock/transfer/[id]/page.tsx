import { notFound, redirect } from "next/navigation";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { AppBackLink } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { isTransferReceiveWorkspaceStatus } from "@lib/inventory/transfer-detail-model";
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

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const data = await loadTransferDetailPageData({
    transferId,
    routeBranchId: branchId,
    includeAudit: false,
    includeCorrections: false,
  });

  // Store branch: redirect legacy YCH or active receive sessions to their dedicated surfaces.
  if (
    context.branch.branch_kind === "branch" &&
    data.transfer.transferScope === "inter_site"
  ) {
    if (data.transfer.stockRequestId != null) {
      redirect(
        `/br/${branchId}/stock/requests/${data.transfer.stockRequestId}`,
      );
    }
    if (
      data.transfer.toBranchId === branchId &&
      isTransferReceiveWorkspaceStatus(data.transfer.status)
    ) {
      redirect(`/br/${branchId}/stock/receive/${transferId}`);
    }
  }

  const copy = messages.inventory.transfer;
  const statusBadge = getStatusBadgeMeta("inventory", data.transfer.status);

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
      back={<AppBackLink href={`/br/${branchId}/stock/transfer`} />}
    >
      <BranchTransferDetailClient
        branchId={branchId}
        transfer={data.transfer}
        userRole={data.userRole}
        userBranchId={data.userBranchId}
        intraSiteData={data.intraSiteData}
      />
    </BranchOperatorPage>
  );
}
