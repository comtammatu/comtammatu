import { loadAuthState } from "@/_lib/auth";
import { fetchIngredients } from "../ingredient-actions";
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
import type { IngredientRow } from "../page";

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
  // collapses to claims.branch_id; for owner/super_manager it
  // reflects the sidebar picker (URL ?branchId=).
  const userBranchId = scope.selectedBranchId;
  const branchFilter = userBranchId ?? undefined;

  const [trRes, brRes, ingRes, locRes] = await Promise.all([
    fetchStockTransfers(branchFilter),
    fetchBranchesForTransfer(),
    fetchIngredients(),
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
  const hqBranchId =
    branches.find((b) => b.branch_kind === "central_warehouse")?.id ?? null;
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];
  const locations: InventoryLocation[] = locRes.success
    ? ((locRes.data ?? []) as InventoryLocation[])
    : [];
  const createParam = Array.isArray(params.create)
    ? params.create[0]
    : params.create;

  return (
    <TransfersListClient
      initial={rows}
      branches={branches}
      ingredients={ingredients}
      locations={locations}
      hqBranchId={hqBranchId}
      userBranchId={userBranchId}
      userRole={claims.user_role}
      basePath="/inventory/transfers"
      initialCreateOpen={createParam === "cap-bep"}
    />
  );
}
