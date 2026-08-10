import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import { suggestedOrderQtyBase } from "./suggested-order-qty";

type DbClient = SupabaseClient<Database>;

/** Sum on-hand by ingredient for one branch, then suggested base qty. */
export async function loadSuggestedOrderQtyByIngredient(params: {
  supabase: DbClient;
  tenantId: number;
  branchId: number;
  ingredientIds: number[];
  minStockByIngredient: Map<number, number | null>;
}): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  const { ingredientIds, minStockByIngredient } = params;
  if (ingredientIds.length === 0) return result;

  const { data, error } = await params.supabase
    .from("stock_levels")
    .select("ingredient_id, current_quantity")
    .eq("tenant_id", params.tenantId)
    .eq("branch_id", params.branchId)
    .in("ingredient_id", ingredientIds);

  if (error) {
    throw new Error("inventory.suggested_order_qty.load_failed");
  }

  const onHand = new Map<number, number>();
  for (const row of data ?? []) {
    const id = Number(row.ingredient_id);
    onHand.set(id, (onHand.get(id) ?? 0) + Number(row.current_quantity ?? 0));
  }

  for (const id of ingredientIds) {
    result.set(
      id,
      suggestedOrderQtyBase(
        minStockByIngredient.get(id),
        onHand.get(id) ?? 0,
      ),
    );
  }
  return result;
}
