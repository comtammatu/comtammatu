import type { TenantSupabase } from "@lib/inventory/types";

type LocationRow = {
  id: number;
  name: string | null;
  location_kind: string | null;
  default_consumption: boolean | null;
  branches:
    | { branch_kind?: string | null }
    | Array<{ branch_kind?: string | null }>
    | null;
};

export type StockBearingLocationsResult =
  { ok: true; locationIds: number[]; locations: LocationRow[] } | { ok: false };

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
  if (siteKind === "branch" && locationKind === "kitchen") return true;
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
}): Promise<StockBearingLocationsResult> {
  // Dual FKs inventory_locations→branches (branch_id + branch_tenant) require
  // an explicit constraint hint; bare branches!inner is ambiguous (PGRST201).
  let query = supabase
    .from("inventory_locations")
    .select(
      "id, name, location_kind, default_consumption, branches!inventory_locations_branch_id_fkey!inner ( branch_kind )",
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) return { ok: false };

  const locations = ((data ?? []) as unknown as LocationRow[]).filter((row) =>
    isStockBearingLocationKind({
      siteKind: branchKindFromLocation(row),
      locationKind: row.location_kind,
    }),
  );
  return {
    ok: true,
    locationIds: locations.map((row) => row.id),
    locations,
  };
}
