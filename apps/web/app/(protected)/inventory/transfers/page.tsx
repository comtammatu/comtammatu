import { notFound, redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
} from "../transfer-actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
import type {
  BranchForTransfer,
  TransferTab,
  TransferListRow,
} from "./transfers-list-client";
import { TransfersListClient } from "./transfers-list-client";

interface TransfersPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
    create?: string | string[];
  }>;
  routeBranchId?: number;
  basePath?: string;
  createBasePath?: string;
  createEnabled?: boolean;
  initialTab?: TransferTab;
  pageTitle?: string;
  embedded?: boolean;
}

export async function TransfersPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/transfers",
  createBasePath,
  createEnabled = true,
  initialTab = "receive",
  pageTitle,
  embedded = false,
}: TransfersPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const requested =
    routeBranchId ?? (await resolveRequestedBranchId(params.branchId));
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  if (routeBranchId != null && scope.selectedBranchId !== routeBranchId) {
    notFound();
  }
  // Sidebar-selected branch drives action context. For branch-scoped roles it
  // collapses to claims.branch_id; for owner it reflects the sidebar picker
  // (URL ?branchId=).
  const userBranchId = scope.selectedBranchId;
  const branchFilter = userBranchId ?? undefined;
  const createParam = Array.isArray(params.create)
    ? params.create[0]
    : params.create;

  if (createParam === "cap-bep") {
    if (routeBranchId != null) {
      redirect(`/br/${routeBranchId}/stock`);
    }
    const scopeQuery = userBranchId != null ? `?branchId=${userBranchId}` : "";
    redirect(`/inventory/consumption${scopeQuery}`);
  }

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
      createBasePath={createBasePath}
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
    create?: string | string[];
  }>;
}) {
  return <TransfersPageContent searchParams={searchParams} />;
}
