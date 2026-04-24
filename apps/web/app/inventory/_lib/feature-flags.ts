import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inventory redesign feature flag keys (Tranche 1-3).
 * Must match seed rows in `branch_feature_flags` from
 * `20260425170000_s10_foundation_branch_feature_flags.sql`.
 */
export const INVENTORY_FEATURE_FLAGS = {
  S10_GRN_VARIANCE: "inv_s10_grn_variance",
  S11_WASTE_TIER: "inv_s11_waste_tier",
  S11_EXT_AUTO_WASTE: "inv_s11_ext_auto_waste",
  S12_DASHBOARD_V2: "inv_s12_dashboard_v2",
  S13A_STOCKTAKE_V2: "inv_s13a_stocktake_v2",
  S13B_STOCKTAKE_RECOUNT: "inv_s13b_stocktake_recount",
  S14_AUTO_APPROVE: "inv_s14_auto_approve",
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
