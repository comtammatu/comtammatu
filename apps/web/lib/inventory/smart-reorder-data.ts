import "server-only";

import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import {
  buildBranchMinimumMap,
  resolveEffectiveMinimum,
} from "./branch-stock-threshold-model";

export type SupplyChannel =
  | "supplier_po"
  | "internal_transfer_kitchen"
  | "internal_transfer_supply"
  | "intra_site_transfer";

export type ReorderSuggestionItem = {
  ingredientId: number;
  ingredientName: string;
  sku: string | null;
  categoryName: string | null;
  baseUnitId: number | null;
  baseUnitCode: string | null;
  baseUnitName: string | null;
  currentOnHand: number;
  minStockLevel: number;
  suggestedReorderQty: number;
  supplyChannel: SupplyChannel;
  isBelowMin: boolean;
};

type RpcReorderItem = {
  ingredient_id: number;
  ingredient_name?: string | null;
  sku?: string | null;
  category_name?: string | null;
  base_unit_id?: number | null;
  base_unit_code?: string | null;
  base_unit_name?: string | null;
  current_on_hand?: number | null;
  min_stock_level?: number | null;
  suggested_reorder_qty?: number | null;
  supply_channel?: string | null;
  is_below_min?: boolean | null;
};

type BaseUnitRow = {
  ingredient_id: number;
  unit_id: number;
  units:
    | { code: string | null; name: string | null }
    | { code: string | null; name: string | null }[]
    | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadBranchReorderSuggestionsData(
  routeBranchId: number,
  locationId: number,
) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const locationResult = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId)
    .eq("id", locationId)
    .eq("is_active", true)
    .in("location_kind", ["warehouse", "kitchen"])
    .maybeSingle();
  if (locationResult.error || locationResult.data == null) {
    return {
      branchId: routeBranchId,
      locationId,
      loadFailed: true,
      allItems: [] as ReorderSuggestionItem[],
      belowMinItems: [] as ReorderSuggestionItem[],
      belowMinCount: 0,
    };
  }

  const baseUnitsResult = await supabase
    .from("ingredient_units")
    .select(
      "ingredient_id, unit_id, units!ingredient_units_unit_tenant_fkey(code, name)",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("is_base", true);
  const baseUnits = new Map(
    ((baseUnitsResult.data ?? []) as unknown as BaseUnitRow[]).map((row) => {
      const unit = relatedOne(row.units);
      return [
        row.ingredient_id,
        {
          id: row.unit_id,
          code: unit?.code ?? null,
          name: unit?.name ?? null,
        },
      ] as const;
    }),
  );

  const { data: rpcData, error: rpcError } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: { p_branch_id: number; p_location_id: number },
    ) => Promise<{
      data: RpcReorderItem[] | null;
      error: { message: string } | null;
    }>
  )("get_branch_smart_reorder_suggestions", {
    p_branch_id: routeBranchId,
    p_location_id: locationId,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    const items: ReorderSuggestionItem[] = rpcData.map((item) => {
      const baseUnit = baseUnits.get(Number(item.ingredient_id));
      return {
        ingredientId: Number(item.ingredient_id),
        ingredientName: String(item.ingredient_name ?? ""),
        sku: item.sku ? String(item.sku) : null,
        categoryName: item.category_name ? String(item.category_name) : null,
        baseUnitId: baseUnit?.id ?? null,
        baseUnitCode: baseUnit?.code ?? null,
        baseUnitName: baseUnit?.name ?? null,
        currentOnHand: Number(item.current_on_hand ?? 0),
        minStockLevel: Number(item.min_stock_level ?? 0),
        suggestedReorderQty: Number(item.suggested_reorder_qty ?? 0),
        supplyChannel: (item.supply_channel ?? "supplier_po") as SupplyChannel,
        isBelowMin: Boolean(item.is_below_min),
      };
    });

    const belowMinItems = items.filter((item) => item.isBelowMin);

    return {
      branchId: routeBranchId,
      locationId,
      loadFailed: baseUnitsResult.error != null,
      allItems: items,
      belowMinItems,
      belowMinCount: belowMinItems.length,
    };
  }

  // Fallback: Compute reorder suggestions in TypeScript
  const { data: stockLevels, error: stockError } = await supabase
    .from("stock_levels")
    .select(
      `
      ingredient_id,
      current_quantity,
      ingredient:ingredients(
        id,
        name,
        sku,
        min_stock_level,
        fulfill_from_central_kitchen,
        fulfill_from_central_supply,
        category:ingredient_categories(name)
      ),
      location:inventory_locations!inner(branch_id)
    `,
    )
    .eq("inventory_locations.branch_id", routeBranchId)
    .eq("location_id", locationId);

  if (stockError || !stockLevels) {
    return {
      branchId: routeBranchId,
      locationId,
      loadFailed: true,
      allItems: [] as ReorderSuggestionItem[],
      belowMinItems: [] as ReorderSuggestionItem[],
      belowMinCount: 0,
    };
  }

  const { data: thresholdRows, error: thresholdError } = await supabase
    .from("branch_ingredient_thresholds")
    .select("ingredient_id, min_stock_level, reorder_quantity")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId)
    .eq("location_id", locationId)
    .eq("is_active", true);
  if (thresholdError) {
    return {
      branchId: routeBranchId,
      locationId,
      loadFailed: true,
      allItems: [] as ReorderSuggestionItem[],
      belowMinItems: [] as ReorderSuggestionItem[],
      belowMinCount: 0,
    };
  }
  const branchThresholds = new Map(
    (thresholdRows ?? []).map((row) => [
      row.ingredient_id,
      {
        minStock: Number(row.min_stock_level),
        reorderQuantity:
          row.reorder_quantity == null ? null : Number(row.reorder_quantity),
      },
    ]),
  );
  const branchMinimums = buildBranchMinimumMap(thresholdRows ?? []);

  type IngredientRecord = {
    id?: number;
    name?: string;
    sku?: string | null;
    min_stock_level?: number | null;
    fulfill_from_central_kitchen?: boolean | null;
    fulfill_from_central_supply?: boolean | null;
    category?: { name?: string } | null;
  };

  // Aggregate quantities per ingredient
  const map = new Map<
    number,
    { onHand: number; ing: IngredientRecord | null }
  >();
  for (const row of stockLevels) {
    const ingId = row.ingredient_id;
    const existing = map.get(ingId) ?? {
      onHand: 0,
      ing: (row.ingredient as unknown as IngredientRecord) ?? null,
    };
    existing.onHand += Number(row.current_quantity ?? 0);
    map.set(ingId, existing);
  }

  const items: ReorderSuggestionItem[] = Array.from(map.entries()).map(
    ([ingId, data]) => {
      const branchThreshold = branchThresholds.get(ingId);
      const minStock = resolveEffectiveMinimum(
        data.ing?.min_stock_level,
        branchMinimums,
        ingId,
      );
      const isBelowMin = minStock > 0 && data.onHand <= minStock;
      const suggestedReorderQty = isBelowMin
        ? (branchThreshold?.reorderQuantity ??
          Math.max(0, minStock * 2 - data.onHand))
        : 0;
      let supplyChannel: SupplyChannel = "supplier_po";
      if (data.ing?.fulfill_from_central_kitchen) {
        supplyChannel = "internal_transfer_kitchen";
      } else if (data.ing?.fulfill_from_central_supply) {
        supplyChannel = "internal_transfer_supply";
      }

      const baseUnit = baseUnits.get(ingId);
      return {
        ingredientId: ingId,
        ingredientName: data.ing?.name ?? UNKNOWN_LABEL_VI,
        sku: data.ing?.sku ?? null,
        categoryName: data.ing?.category?.name ?? null,
        baseUnitId: baseUnit?.id ?? null,
        baseUnitCode: baseUnit?.code ?? null,
        baseUnitName: baseUnit?.name ?? null,
        currentOnHand: data.onHand,
        minStockLevel: minStock,
        suggestedReorderQty,
        supplyChannel,
        isBelowMin,
      };
    },
  );

  const belowMinItems = items.filter((item) => item.isBelowMin);

  return {
    branchId: routeBranchId,
    locationId,
    loadFailed: baseUnitsResult.error != null,
    allItems: items,
    belowMinItems,
    belowMinCount: belowMinItems.length,
  };
}
