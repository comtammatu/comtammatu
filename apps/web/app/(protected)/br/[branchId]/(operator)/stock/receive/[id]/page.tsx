import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
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

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();

  const data = await loadTransferDetailPageData({
    transferId,
    routeBranchId: branchId,
    includeAudit: false,
    includeCorrections: false,
  });

  const isStoreBranch = branchContext.branch.branch_kind === "branch";
  const documentTitle = isStoreBranch
    ? (data.transfer.stockRequestNumber ?? data.transfer.code)
    : data.transfer.code;

  return (
    <TransferReceiveClient
      transfer={data.transfer}
      backHref={`/br/${branchId}/stock?work=receive`}
      detailHref={
        isStoreBranch
          ? null
          : `/br/${branchId}/stock/transfer/${transferId}`
      }
      documentTitle={documentTitle}
    />
  );
}
