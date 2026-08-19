import "server-only";

import { notFound } from "next/navigation";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { fetchBranchesForTransfer } from "@/(protected)/inventory/transfer-actions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { resolveFulfillSiteFlags } from "@lib/inventory/fulfill-site";
import type { IngredientRow } from "@lib/inventory/types";
import {
  type BranchForTransfer,
  type TransferIngredientOption,
  type TransferSourceLocation,
} from "./transfer-create-model";

interface LoadTransferCreatePageDataOptions {
  routeBranchId?: number;
  queryBranch?: string | string[];
}

export interface TransferCreatePageData {
  branches: BranchForTransfer[];
  ingredients: TransferIngredientOption[];
  sourceLocationsByBranch: Record<number, TransferSourceLocation[]>;
  sourceStockByLocation: Record<number, Record<number, number>>;
  userBranchId: number | null;
  loadFailed: boolean;
}

function toTransferIngredientOption(
  ingredient: IngredientRow,
): TransferIngredientOption {
  const flags = resolveFulfillSiteFlags({
    fulfillFromCentralSupply: ingredient.fulfill_from_central_supply,
    fulfillFromCentralKitchen: ingredient.fulfill_from_central_kitchen,
    defaultFulfillSiteKind: ingredient.default_fulfill_site_kind,
  });
  return {
    id: ingredient.id,
    name: ingredient.name,
    is_active: ingredient.is_active,
    itemKind: ingredient.item_kind ?? null,
    units: ingredient.units,
    fulfillFromCentralSupply: flags.fulfillFromCentralSupply,
    fulfillFromCentralKitchen: flags.fulfillFromCentralKitchen,
  };
}

export async function loadTransferCreatePageData({
  routeBranchId,
  queryBranch,
}: LoadTransferCreatePageDataOptions = {}): Promise<TransferCreatePageData> {
  const { supabase, claims } = await loadAuthState();
  if (
    !INVENTORY_OPS_ROLES.includes(
      claims.user_role as (typeof INVENTORY_OPS_ROLES)[number],
    )
  ) {
    notFound();
  }
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranch,
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
  const sourceBranchIds = [
    ...new Set(
      [
        userBranchId,
        ...branches
          .filter(
            (branch) =>
              branch.branch_kind === "central_supply" ||
              branch.branch_kind === "central_kitchen",
          )
          .map((branch) => branch.id),
      ].filter((id): id is number => id != null),
    ),
  ];
  const sourceLocationsByBranch: Record<number, TransferSourceLocation[]> = {};
  const sourceStockByLocation: Record<number, Record<number, number>> = {};

  if (sourceBranchIds.length > 0) {
    const { data: sourceLocations, error: sourceLocationsError } =
      await supabase
        .from("inventory_locations")
        .select("id, branch_id, location_kind, is_default_issue")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .in("branch_id", sourceBranchIds)
        .eq("location_kind", "warehouse")
        .order("is_default_issue", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
    if (sourceLocationsError) loadFailed = true;

    for (const location of sourceLocations ?? []) {
      if (location.location_kind !== "warehouse") {
        continue;
      }
      const branchLocations = sourceLocationsByBranch[location.branch_id] ?? [];
      branchLocations.push({
        id: location.id,
        branchId: location.branch_id,
        kind: location.location_kind,
        isDefaultIssue: location.is_default_issue,
      });
      sourceLocationsByBranch[location.branch_id] = branchLocations;
    }

    const sourceLocationIds = Object.values(sourceLocationsByBranch)
      .flat()
      .map((location) => location.id);
    if (sourceLocationIds.length === 0) {
      return {
        branches,
        ingredients,
        sourceLocationsByBranch,
        sourceStockByLocation,
        userBranchId,
        loadFailed,
      };
    }

    const { data: sourceStockLevels, error: sourceStockError } = await supabase
      .from("stock_levels")
      .select("location_id, ingredient_id, current_quantity")
      .eq("tenant_id", claims.tenant_id)
      .in("location_id", sourceLocationIds);
    if (sourceStockError) loadFailed = true;

    for (const row of sourceStockLevels ?? []) {
      const locationStock = sourceStockByLocation[row.location_id] ?? {};
      locationStock[row.ingredient_id] = Number(row.current_quantity ?? 0);
      sourceStockByLocation[row.location_id] = locationStock;
    }
  }

  return {
    branches,
    ingredients,
    sourceLocationsByBranch,
    sourceStockByLocation,
    userBranchId,
    loadFailed,
  };
}
