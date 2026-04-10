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

  if (error || !data) return null;
  return data.id;
}
