import type { TenantSupabase } from "./types";

export type InventorySiteKind =
  | "branch";

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
    .eq("branch_kind", "branch")
    .order("name");

  if (error) return [];
  return data ?? [];
}

export type InventorySiteContext = {
  branchId: number;
  branchName: string;
  branchKind: InventorySiteKind;
};

export async function fetchInventorySiteContext(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number | null | undefined,
): Promise<InventorySiteContext | null> {
  const baseSelect = "id, name, branch_kind";

  const loadBranch = async (targetBranchId: number | null) => {
    if (!targetBranchId) return null;
    const { data, error } = await supabase
      .from("branches")
      .select(baseSelect)
      .eq("tenant_id", tenantId)
      .eq("id", targetBranchId)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  };

  const branch = await loadBranch(branchId ?? null);

  // Fallback to the first active branch if no branch was specified.
  let fallbackData = branch;
  if (!fallbackData) {
    const procBranches = await fetchProcurementBranches(supabase, tenantId);
    const fallbackBranchId = procBranches[0]?.id;
    if (fallbackBranchId) {
      fallbackData = await loadBranch(fallbackBranchId);
    }
  }

  if (!fallbackData) return null;

  return {
    branchId: fallbackData.id,
    branchName: fallbackData.name,
    branchKind: "branch",
  };
}
