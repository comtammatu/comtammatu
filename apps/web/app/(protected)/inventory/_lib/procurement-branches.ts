import type { TenantSupabase } from "./types";

export type ProcurementBranch = {
  id: number;
  name: string;
  branch_kind: string;
};

/** Fetch all active branches that can procure. */
export async function fetchProcurementBranches(
  supabase: TenantSupabase,
  tenantId: number,
): Promise<ProcurementBranch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("branch_kind", ["branch", "central_supply", "central_kitchen"])
    .order("name");

  if (error) return [];
  return data ?? [];
}
