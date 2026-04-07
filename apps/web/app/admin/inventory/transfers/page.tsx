import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchIngredientsForBranch } from "../actions";
import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
  resolveHeadquartersBranchId,
} from "../transfer-actions";
import { TransfersListClient } from "./transfers-list-client";
import type {
  BranchForTransfer,
  TransferListRow,
} from "./transfers-list-client";
import type { IngredientRow } from "../page";

export default async function TransfersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claims = user ? extractClaims(user.app_metadata) : null;

  const [trRes, brRes, hqBranchId] = await Promise.all([
    fetchStockTransfers(),
    fetchBranchesForTransfer(),
    resolveHeadquartersBranchId(),
  ]);
  const ingRes =
    hqBranchId != null
      ? await fetchIngredientsForBranch(hqBranchId)
      : { success: true as const, data: [] };
  const rows: TransferListRow[] = trRes.success
    ? ((trRes.data ?? []) as TransferListRow[])
    : [];
  const branches: BranchForTransfer[] = brRes.success
    ? ((brRes.data ?? []) as BranchForTransfer[])
    : [];
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <TransfersListClient
      initial={rows}
      branches={branches}
      ingredients={ingredients}
      hqBranchId={hqBranchId}
      userBranchId={claims?.branch_id ?? null}
      userRole={claims?.user_role ?? "branch_manager"}
    />
  );
}
