import type { TenantSupabase } from "./types";

export type InventorySiteKind =
  | "central_warehouse"
  | "central_kitchen"
  | "branch";

export type ProcurementBranch = {
  id: number;
  name: string;
  branch_kind: string;
};

/** Fetch all branches that can procure (central_warehouse + central_kitchen). */
export async function fetchProcurementBranches(
  supabase: TenantSupabase,
  tenantId: number,
): Promise<ProcurementBranch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("branch_kind", ["central_warehouse", "central_kitchen"])
    .order("id");

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

  // Fallback to first central_warehouse if no branch specified.
  let fallbackData = branch;
  if (!fallbackData) {
    const procBranches = await fetchProcurementBranches(supabase, tenantId);
    const warehouseId = procBranches.find(
      (b) => b.branch_kind === "central_warehouse",
    )?.id;
    if (warehouseId) {
      fallbackData = await loadBranch(warehouseId);
    }
  }

  if (!fallbackData) return null;

  const kind: InventorySiteKind =
    fallbackData.branch_kind === "central_kitchen"
      ? "central_kitchen"
      : fallbackData.branch_kind === "central_warehouse"
        ? "central_warehouse"
        : "branch";

  return {
    branchId: fallbackData.id,
    branchName: fallbackData.name,
    branchKind: kind,
  };
}
