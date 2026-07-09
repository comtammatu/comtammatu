import "server-only";

import { notFound } from "next/navigation";
import type { StaffRole } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { fetchBranchesForTransfer } from "@/(protected)/inventory/transfer-actions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { resolveDefaultInventoryLocation } from "@/(protected)/inventory/_lib/inventory-location-compat";
import type { IngredientRow } from "@/(protected)/inventory/page";
import {
  getTransferSourceBranchIds,
  type BranchForTransfer,
  type TransferIngredientOption,
} from "./transfer-create-model";

interface LoadTransferCreatePageDataOptions {
  routeBranchId?: number;
  queryBranchId?: string | string[];
}

export interface TransferCreatePageData {
  branches: BranchForTransfer[];
  ingredients: TransferIngredientOption[];
  sourceStockByBranch: Record<number, Record<number, number>>;
  userBranchId: number | null;
  userRole: StaffRole;
  loadFailed: boolean;
}

function toTransferIngredientOption(
  ingredient: IngredientRow,
): TransferIngredientOption {
  return {
    id: ingredient.id,
    name: ingredient.name,
    is_active: ingredient.is_active,
    units: ingredient.units,
  };
}

export async function loadTransferCreatePageData({
  routeBranchId,
  queryBranchId,
}: LoadTransferCreatePageDataOptions = {}): Promise<TransferCreatePageData> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId,
  });
  const userBranchId = scope.selectedBranchId;
  if (scope.outOfScope) notFound();

  const [branchResult, ingredientResult] = await Promise.all([
    fetchBranchesForTransfer(),
    fetchIngredients(),
  ]);
  const branches: BranchForTransfer[] = branchResult.success
    ? ((branchResult.data ?? []) as BranchForTransfer[])
    : [];
  const ingredients: TransferIngredientOption[] = ingredientResult.success
    ? ((ingredientResult.data ?? []) as IngredientRow[]).map(
        toTransferIngredientOption,
      )
    : [];
  let loadFailed = !branchResult.success || !ingredientResult.success;
  const sourceBranchIds = getTransferSourceBranchIds({
    branches,
    userBranchId,
    userRole: claims.user_role,
  });
  const sourceLocations = await Promise.all(
    sourceBranchIds.map(async (branchId) => ({
      branchId,
      locationId: await resolveDefaultInventoryLocation(
        supabase,
        claims.tenant_id,
        branchId,
        "issue",
      ),
    })),
  );
  const locationByBranch = new Map(
    sourceLocations
      .filter(
        (item): item is { branchId: number; locationId: number } =>
          item.locationId != null,
      )
      .map((item) => [item.branchId, item.locationId] as const),
  );
  const sourceStockByBranch: Record<number, Record<number, number>> = {};

  if (locationByBranch.size > 0) {
    const { data: sourceStockLevels, error: sourceStockError } = await supabase
      .from("stock_levels")
      .select("branch_id, location_id, ingredient_id, current_quantity")
      .eq("tenant_id", claims.tenant_id)
      .in("branch_id", [...locationByBranch.keys()])
      .in("location_id", [...locationByBranch.values()]);
    if (sourceStockError) loadFailed = true;

    for (const row of sourceStockLevels ?? []) {
      if (row.location_id !== locationByBranch.get(row.branch_id)) continue;
      const branchStock = sourceStockByBranch[row.branch_id] ?? {};
      branchStock[row.ingredient_id] = Number(row.current_quantity ?? 0);
      sourceStockByBranch[row.branch_id] = branchStock;
    }
  }

  return {
    branches,
    ingredients,
    sourceStockByBranch,
    userBranchId,
    userRole: claims.user_role,
    loadFailed,
  };
}
