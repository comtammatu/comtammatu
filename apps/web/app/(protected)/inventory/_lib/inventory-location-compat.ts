import type { TenantSupabase } from "./types";

export type InventoryLocationMode = "receive" | "issue";

const LOCATION_DEFAULT_FLAG: Record<InventoryLocationMode, string> = {
  receive: "is_default_receive",
  issue: "is_default_issue",
};

export async function resolveDefaultInventoryLocation(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number,
  mode: InventoryLocationMode,
): Promise<number | null> {
  const defaultFlag = LOCATION_DEFAULT_FLAG[mode];
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq(defaultFlag, true)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;

  return data?.id ?? null;
}
