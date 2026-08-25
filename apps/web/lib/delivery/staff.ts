import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";

/**
 * Resolves the appropriate staff UUID to act as created_by for delivery orders.
 * Order of priority:
 * 1. Active Branch Manager (positions.code = 'branch_manager') assigned to the branch
 * 2. Active Cashier (positions.code = 'cashier') assigned to the branch
 * 3. Any active staff member assigned to the branch
 * 4. Fallback: Active HQ Owner / Manager profile
 */
export async function resolveBranchStaffId(
  supabase: SupabaseClient<Database>,
  tenantId: number,
  branchId: number,
): Promise<string | null> {
  // 1. Branch Manager
  const { data: managerProfile } = await supabase
    .from("profiles")
    .select("id, positions!inner(code)")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .eq("positions.code", "branch_manager")
    .limit(1)
    .maybeSingle();

  if (managerProfile?.id) return managerProfile.id;

  // 2. Cashier
  const { data: cashierProfile } = await supabase
    .from("profiles")
    .select("id, positions!inner(code)")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .eq("positions.code", "cashier")
    .limit(1)
    .maybeSingle();

  if (cashierProfile?.id) return cashierProfile.id;

  // 3. Any branch staff
  const { data: anyBranchStaff } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (anyBranchStaff?.id) return anyBranchStaff.id;

  // 4. HQ fallback
  const { data: hqProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return hqProfile?.id ?? null;
}
