import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inventory redesign feature flag keys (Tranche 1-3).
 * Must match seed rows in `branch_feature_flags` from
 * The database baseline owns the persisted branch feature-flag contract.
 */
export const INVENTORY_FEATURE_FLAGS = {
  POS_STOCK_OUTCOME_POSTING: "pos_stock_outcome_posting",
} as const;

export type InventoryFeatureFlag =
  (typeof INVENTORY_FEATURE_FLAGS)[keyof typeof INVENTORY_FEATURE_FLAGS];

/**
 * Check whether a feature flag is enabled for a given branch.
 * Wraps `is_feature_enabled(branch_id, flag_key)` RPC.
 * Defaults to `false` on any error — fail-safe: new UI stays hidden.
 */
export async function isFeatureEnabledForBranch(
  supabase: SupabaseClient,
  branchId: number,
  flagKey: InventoryFeatureFlag,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_feature_enabled", {
    p_branch_id: branchId,
    p_flag_key: flagKey,
  });
  if (error) return false;
  return Boolean(data);
}
