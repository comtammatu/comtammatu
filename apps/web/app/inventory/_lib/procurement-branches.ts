import type { Database, SupabaseClient } from "@comtammatu/database";

type TenantSupabase = SupabaseClient<Database>;

export type InventorySiteKind = "warehouse" | "central_kitchen" | "branch";

export type ProcurementBranch = {
  id: number;
  name: string;
  branch_kind: string;
};

/** Fetch all branches that can procure (warehouse + central_kitchen). */
export async function fetchProcurementBranches(
  supabase: TenantSupabase,
  tenantId: number,
): Promise<ProcurementBranch[]> {
  // Try branch_kind first (post-migration)
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("branch_kind", ["warehouse", "central_kitchen", "headquarters"])
    .order("id");

  if (!error && data && data.length > 0) return data;

  // Fallback: pre-migration, use is_headquarters
  const { data: fallback } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", tenantId)
    .eq("is_headquarters", true)
    .maybeSingle();

  if (fallback) return [fallback];

  // Last resort: RPC
  const { data: branchList } = await supabase.rpc(
    "stock_transfer_list_branches",
  );
  const hqBranch = (
    (branchList as Array<{ id: number; name: string; is_headquarters: boolean; branch_kind: string }> | null) ?? []
  ).find((b) => b.is_headquarters);

  return hqBranch ? [{ id: hqBranch.id, name: hqBranch.name, branch_kind: hqBranch.branch_kind ?? "warehouse" }] : [];
}

/**
 * @deprecated Use fetchProcurementBranches() instead.
 * Returns the first warehouse branch ID for backward compat.
 */
export async function fetchHeadquartersBranchId(
  supabase: TenantSupabase,
  tenantId: number,
): Promise<number | null> {
  const branches = await fetchProcurementBranches(supabase, tenantId);
  const warehouse = branches.find(
    (b) => b.branch_kind === "warehouse" || b.branch_kind === "headquarters",
  );
  return warehouse?.id ?? branches[0]?.id ?? null;
}

export type InventorySiteContext = {
  branchId: number;
  branchName: string;
  branchKind: InventorySiteKind;
  isHeadquarters: boolean;
};

export async function fetchInventorySiteContext(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number | null | undefined,
): Promise<InventorySiteContext | null> {
  const baseSelect = "id, name, branch_kind, is_headquarters";

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

  // Fallback to first warehouse if no branch specified
  let fallbackData = branch;
  if (!fallbackData) {
    const procBranches = await fetchProcurementBranches(supabase, tenantId);
    const warehouseId = procBranches.find(
      (b) => b.branch_kind === "warehouse" || b.branch_kind === "headquarters",
    )?.id;
    if (warehouseId) {
      fallbackData = await loadBranch(warehouseId);
    }
  }

  if (!fallbackData) return null;

  const kind: InventorySiteKind =
    fallbackData.branch_kind === "central_kitchen"
      ? "central_kitchen"
      : fallbackData.branch_kind === "warehouse" || fallbackData.is_headquarters
        ? "warehouse"
        : "branch";

  return {
    branchId: fallbackData.id,
    branchName: fallbackData.name,
    branchKind: kind,
    isHeadquarters: fallbackData.is_headquarters === true,
  };
}
