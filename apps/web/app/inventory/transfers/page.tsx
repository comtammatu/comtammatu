import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchIngredients } from "../actions";
import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
  resolveHeadquartersBranchId,
} from "../transfer-actions";
import type {
  BranchForTransfer,
  TransferListRow,
} from "./transfers-list-client";
import { TransfersListClient } from "./transfers-list-client";
import type { IngredientRow } from "../page";

export default async function TransfersPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const [trRes, brRes, hqBranchId, ingRes] = await Promise.all([
    fetchStockTransfers(),
    fetchBranchesForTransfer(),
    resolveHeadquartersBranchId(),
    fetchIngredients(),
  ]);

  const rows: TransferListRow[] = trRes.success
    ? ((trRes.data ?? []) as TransferListRow[])
    : [];
  const branches: BranchForTransfer[] = brRes.success
    ? ((brRes.data ?? []) as BranchForTransfer[])
    : [];
  const resolvedHqBranchId =
    hqBranchId ?? branches.find((b) =>
      b.branch_kind === "warehouse" || b.branch_kind === "headquarters" || b.is_headquarters
    )?.id ?? null;
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <TransfersListClient
      initial={rows}
      branches={branches}
      ingredients={ingredients}
      hqBranchId={resolvedHqBranchId}
      userBranchId={claims?.branch_id ?? null}
      userRole={claims?.user_role ?? "branch_manager"}
      basePath="/inventory/transfers"
    />
  );
}
