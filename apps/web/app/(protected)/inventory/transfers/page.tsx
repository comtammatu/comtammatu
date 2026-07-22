import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
} from "../transfer-actions";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import type {
  BranchForTransfer,
  TransferTab,
  TransferListRow,
} from "./transfers-list-client";
import { TransfersListClient } from "./transfers-list-client";

interface TransfersPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
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
  createEnabled = true,
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

  const [trRes, brRes] = await Promise.all([
    fetchStockTransfers(branchFilter),
    fetchBranchesForTransfer(),
  ]);

  const rows: TransferListRow[] = trRes.success
    ? ((trRes.data ?? []) as TransferListRow[])
    : [];
  const branches: BranchForTransfer[] = brRes.success
    ? ((brRes.data ?? []) as BranchForTransfer[])
    : [];

  return (
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
  );
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
  }>;
}) {
  return <TransfersPageContent searchParams={searchParams} />;
}
