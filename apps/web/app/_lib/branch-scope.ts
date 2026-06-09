import type { JwtClaims } from "@comtammatu/shared/auth";

export async function canAccessBranch(
  // Supabase client type is intentionally loose here to avoid
  // deep generic instantiation across generated Database types.
  supabase: unknown,
  claims: JwtClaims,
  branchId: number,
): Promise<boolean> {
  void supabase;

  if (claims.user_role === "owner" || claims.user_role === "super_manager") {
    return true;
  }

  if (claims.branch_id != null) {
    return claims.branch_id === branchId;
  }

  return true;
}
