import { loadAuthState } from "@/_lib/auth";
import type { JwtClaims } from "@comtammatu/shared/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmployeeContext {
  supabase: SupabaseClient;
  claims: JwtClaims;
  employeeId: number;
  startDate: string | null;
  branchId: number | null;
  branchName: string | null;
}

/**
 * Resolve the current user's employee context for self-service routes.
 *
 * Server-side only. Resolves auth.uid() → employees.profile_id → employees.id
 * and fetches the assigned branch name. Returns null if the user has no
 * employee record or the session is invalid.
 */
export async function getEmployeeContext(): Promise<EmployeeContext | null> {
  const state = await loadAuthState();
  const { supabase, claims, user } = state;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, start_date")
    .eq("profile_id", user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) return null;

  let branchName: string | null = null;
  if (claims.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select("name")
      .eq("id", claims.branch_id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchName = data?.name ?? null;
  }

  return {
    supabase,
    claims,
    employeeId: employee.id,
    startDate: employee.start_date,
    branchId: claims.branch_id,
    branchName,
  };
}
