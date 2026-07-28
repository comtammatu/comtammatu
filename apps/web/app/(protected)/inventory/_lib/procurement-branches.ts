import type { TenantSupabase } from "@lib/inventory/types";

export const PROCUREMENT_SITE_KINDS = [
  "central_supply",
  "central_kitchen",
] as const;

export type ProcurementBranch = {
  id: number;
  name: string;
  branch_kind: string;
};

/** Fetch active central sites that can procure (D093 — no branch GRN). */
export async function fetchProcurementBranches(
  supabase: TenantSupabase,
  tenantId: number,
): Promise<ProcurementBranch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("branch_kind", [...PROCUREMENT_SITE_KINDS])
    .order("name");

  if (error) return [];
  return data ?? [];
}
