import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchIngredients } from "../actions";
import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
  fetchInventoryLocationsForBranch,
} from "../transfer-actions";
import { parseBranchIdParam } from "../_lib/inventory-scope";
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
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchFilter = parseBranchIdParam(params.branchId) ?? undefined;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const userBranchId = claims?.branch_id ?? null;

  const [trRes, brRes, ingRes, locRes] = await Promise.all([
    fetchStockTransfers(branchFilter),
    fetchBranchesForTransfer(),
    fetchIngredients(),
    userBranchId != null
      ? fetchInventoryLocationsForBranch(userBranchId)
      : Promise.resolve({ success: true as const, data: [] }),
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

  return (
    <TransfersListClient
      initial={rows}
      branches={branches}
      ingredients={ingredients}
      locations={locations}
      hqBranchId={hqBranchId}
      userBranchId={userBranchId}
      userRole={claims?.user_role ?? "branch_manager"}
      basePath="/inventory/transfers"
    />
  );
}
