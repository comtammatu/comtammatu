import type { TenantSupabase } from "./types";

type LocationRow = {
  id: number;
  location_kind: string | null;
  branches:
    | { branch_kind?: string | null }
    | Array<{ branch_kind?: string | null }>
    | null;
};

function branchKindFromLocation(row: LocationRow): string {
  const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
  return branch?.branch_kind ?? "branch";
}

export function isStockBearingLocationKind({
  siteKind,
  locationKind,
}: {
  siteKind: string | null | undefined;
  locationKind: string | null | undefined;
}): boolean {
  if (locationKind === "warehouse") return true;
  return (
    siteKind === "central_kitchen" && locationKind === "production_storage"
  );
}

export async function fetchStockBearingLocationIds({
  supabase,
  tenantId,
  branchId,
}: {
  supabase: TenantSupabase;
  tenantId: number;
  branchId?: number;
}): Promise<number[]> {
  let query = supabase
    .from("inventory_locations")
    .select("id, location_kind, branches!inner ( branch_kind )")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) return [];

  return ((data ?? []) as LocationRow[])
    .filter((row) =>
      isStockBearingLocationKind({
        siteKind: branchKindFromLocation(row),
        locationKind: row.location_kind,
      }),
    )
    .map((row) => row.id);
}
