import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import { mapPromotionRpcError } from "./rpc-errors";

export async function evaluateOrderPromotionsQuiet(
  supabase: SupabaseClient<Database>,
  orderId: number,
): Promise<void> {
  const { error } = await supabase.rpc("evaluate_order_promotions", {
    p_order_id: orderId,
  });
  if (error) {
    console.error("[evaluate_order_promotions]", error.message);
  }
}

export async function evaluateOrderPromotionsBlocking(
  supabase: SupabaseClient<Database>,
  orderId: number,
): Promise<string | null> {
  const { error } = await supabase.rpc("evaluate_order_promotions", {
    p_order_id: orderId,
  });
  if (!error) return null;
  return mapPromotionRpcError(error.message);
}
