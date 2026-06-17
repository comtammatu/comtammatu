import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
  fetchInventoryLocationsForBranch,
} from "../transfer-actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
import type {
  BranchForTransfer,
  InventoryLocation,
  TransferListRow,
} from "./transfers-list-client";
import { TransfersListClient } from "./transfers-list-client";

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    create?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  // Sidebar-selected branch drives action context. For branch-scoped roles it
  // collapses to claims.branch_id; for owner it reflects the sidebar picker
  // (URL ?branchId=).
  const userBranchId = scope.selectedBranchId;
  const branchFilter = userBranchId ?? undefined;
  const createParam = Array.isArray(params.create)
    ? params.create[0]
    : params.create;

  if (createParam === "cap-bep") {
    const scopeQuery = userBranchId != null ? `?branchId=${userBranchId}` : "";
    redirect(`/inventory/transfers/new${scopeQuery}`);
  }

  const [trRes, brRes, locRes] = await Promise.all([
    fetchStockTransfers(branchFilter),
    fetchBranchesForTransfer(),
    userBranchId != null
      ? fetchInventoryLocationsForBranch(userBranchId)
      : Promise.resolve({ success: true as const, data: [] as never[] }),
  ]);

  const rows: TransferListRow[] = trRes.success
    ? ((trRes.data ?? []) as TransferListRow[])
    : [];
  const branches: BranchForTransfer[] = brRes.success
    ? ((brRes.data ?? []) as BranchForTransfer[])
    : [];
  const locations: InventoryLocation[] = locRes.success
    ? ((locRes.data ?? []) as InventoryLocation[])
    : [];

  return (
    <TransfersListClient
      initial={rows}
      branches={branches}
      locations={locations}
      userBranchId={userBranchId}
      userRole={claims.user_role}
      basePath="/inventory/transfers"
    />
  );
}
