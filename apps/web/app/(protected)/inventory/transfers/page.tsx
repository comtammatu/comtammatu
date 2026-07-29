import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
} from "../transfer-actions";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { TransferDetailClient } from "./[id]/transfer-detail-client";
import type {
  BranchForTransfer,
  TransferTab,
  TransferListRow,
} from "./transfers-list-client";
import { TransfersListClient } from "./transfers-list-client";

interface TransfersPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
    transferId?: string | string[];
    mode?: string | string[];
  }>;
  routeBranchId?: number;
  basePath?: string;
  createEnabled?: boolean;
  initialTab?: TransferTab;
  pageTitle?: string;
  embedded?: boolean;
}

export async function TransfersPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/transfers",
  createEnabled = false,
  initialTab = "receive",
  pageTitle,
  embedded = false,
}: TransfersPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  // Sidebar-selected branch drives action context. For branch-scoped roles it
  // collapses to claims.branch_id; for owner it reflects the sidebar picker
  // (URL ?branchId=).
  const userBranchId = scope.selectedBranchId;
  const branchFilter = userBranchId ?? undefined;
  const rawTransferId = Array.isArray(params.transferId)
    ? params.transferId[0]
    : params.transferId;
  const transferId = Number(rawTransferId);
  const selectedTransferId =
    !embedded && Number.isInteger(transferId) && transferId > 0
      ? transferId
      : null;

  const [trRes, brRes, detail] = await Promise.all([
    fetchStockTransfers(branchFilter),
    fetchBranchesForTransfer(),
    selectedTransferId == null
      ? Promise.resolve(null)
      : loadTransferDetailPageData({
          transferId: selectedTransferId,
          queryBranchId: params.branchId,
        }),
  ]);
  if (!trRes.success || !brRes.success) {
    throw new Error("inventory.transfers.load_failed");
  }

  const rows = (trRes.data ?? []) as TransferListRow[];
  const branches = (brRes.data ?? []) as BranchForTransfer[];

  return (
    <>
      <TransfersListClient
        initial={rows}
        branches={branches}
        userBranchId={userBranchId}
        userRole={claims.user_role}
        basePath={basePath}
        createEnabled={createEnabled}
        initialTab={initialTab}
        pageTitle={pageTitle}
        embedded={embedded}
      />
      {detail ? (
        <TransferDetailClient
          transfer={detail.transfer}
          userRole={detail.userRole}
          userBranchId={detail.userBranchId}
          correctionBranches={detail.correctionBranches}
          auditLogs={detail.auditLogs}
          presentation="dialog"
        />
      ) : null}
    </>
  );
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    transferId?: string | string[];
    mode?: string | string[];
  }>;
}) {
  return <TransfersPageContent searchParams={searchParams} />;
}
