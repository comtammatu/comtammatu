import type { Database, SupabaseClient } from "@comtammatu/database";

type TenantSupabase = SupabaseClient<Database>;

/** Trụ sở — đơn vị duy nhất nhận hàng từ NCC (is_headquarters = true). */
export async function fetchHeadquartersBranchId(
  supabase: TenantSupabase,
  tenantId: number,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_headquarters", true)
    .maybeSingle();

  if (!error && data) return data.id;

  const { data: branchList } = await supabase.rpc("stock_transfer_list_branches");
  const hqBranch = (
    (branchList as Array<{ id: number; is_headquarters: boolean }> | null) ??
    []
  ).find((branch) => branch.is_headquarters);

  return hqBranch?.id ?? null;
}

export type InventorySiteKind = "headquarters" | "central_kitchen" | "branch";

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
  const fallbackResult = await supabase
    .from("branches")
    .select(baseSelect)
    .eq("tenant_id", tenantId)
    .eq("is_headquarters", true)
    .maybeSingle();

  const fallback = branch ?? fallbackResult.data ?? null;

  if (!fallback) return null;

  const kind: InventorySiteKind =
    fallback.branch_kind === "central_kitchen"
      ? "central_kitchen"
      : fallback.is_headquarters
        ? "headquarters"
        : "branch";

  return {
    branchId: fallback.id,
    branchName: fallback.name,
    branchKind: kind,
    isHeadquarters: fallback.is_headquarters === true,
  };
}
