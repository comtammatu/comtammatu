import "server-only";

import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";

export type SupplyChannel =
  | "supplier_po"
  | "internal_transfer_kitchen"
  | "internal_transfer_supply";

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

export async function loadBranchReorderSuggestionsData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const { data: rpcData, error: rpcError } = await (supabase.rpc as unknown as (
    fn: string,
    args: { p_branch_id: number },
  ) => Promise<{ data: RpcReorderItem[] | null; error: { message: string } | null }>)(
    "get_branch_smart_reorder_suggestions",
    { p_branch_id: routeBranchId },
  );

  if (!rpcError && Array.isArray(rpcData)) {
    const items: ReorderSuggestionItem[] = rpcData.map((item) => ({
      ingredientId: Number(item.ingredient_id),
      ingredientName: String(item.ingredient_name ?? ""),
      sku: item.sku ? String(item.sku) : null,
      categoryName: item.category_name ? String(item.category_name) : null,
      baseUnitId: item.base_unit_id ? Number(item.base_unit_id) : null,
      baseUnitCode: item.base_unit_code ? String(item.base_unit_code) : null,
      baseUnitName: item.base_unit_name ? String(item.base_unit_name) : null,
      currentOnHand: Number(item.current_on_hand ?? 0),
      minStockLevel: Number(item.min_stock_level ?? 0),
      suggestedReorderQty: Number(item.suggested_reorder_qty ?? 0),
      supplyChannel: (item.supply_channel ?? "supplier_po") as SupplyChannel,
      isBelowMin: Boolean(item.is_below_min),
    }));

    const belowMinItems = items.filter((item) => item.isBelowMin);

    return {
      branchId: routeBranchId,
      loadFailed: false,
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
        category:ingredient_categories(name),
        receipt_unit:units!ingredients_receipt_unit_id_fkey(id, code, name)
      ),
      location:inventory_locations!inner(branch_id)
    `,
    )
    .eq("inventory_locations.branch_id", routeBranchId);

  if (stockError || !stockLevels) {
    return {
      branchId: routeBranchId,
      loadFailed: true,
      allItems: [] as ReorderSuggestionItem[],
      belowMinItems: [] as ReorderSuggestionItem[],
      belowMinCount: 0,
    };
  }

  type IngredientRecord = {
    id?: number;
    name?: string;
    sku?: string | null;
    min_stock_level?: number | null;
    fulfill_from_central_kitchen?: boolean | null;
    fulfill_from_central_supply?: boolean | null;
    category?: { name?: string } | null;
    receipt_unit?: { id?: number; code?: string; name?: string } | null;
  };

  // Aggregate quantities per ingredient
  const map = new Map<number, { onHand: number; ing: IngredientRecord | null }>();
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
      const minStock = Number(data.ing?.min_stock_level ?? 0);
      const isBelowMin = minStock > 0 && data.onHand <= minStock;
      const suggestedReorderQty = isBelowMin
        ? Math.max(0, minStock * 2 - data.onHand)
        : 0;
      let supplyChannel: SupplyChannel = "supplier_po";
      if (data.ing?.fulfill_from_central_kitchen) {
        supplyChannel = "internal_transfer_kitchen";
      } else if (data.ing?.fulfill_from_central_supply) {
        supplyChannel = "internal_transfer_supply";
      }

      return {
        ingredientId: ingId,
        ingredientName: data.ing?.name ?? `Nguyên liệu #${ingId}`,
        sku: data.ing?.sku ?? null,
        categoryName: data.ing?.category?.name ?? null,
        baseUnitId: data.ing?.receipt_unit?.id ?? null,
        baseUnitCode: data.ing?.receipt_unit?.code ?? null,
        baseUnitName: data.ing?.receipt_unit?.name ?? null,
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
    loadFailed: false,
    allItems: items,
    belowMinItems,
    belowMinCount: belowMinItems.length,
  };
}
