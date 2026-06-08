import type { JwtClaims } from "@comtammatu/shared/auth";

export async function canAccessBranch(
  // Supabase client kept in the signature for call-site compatibility; unused
  // since the area scope was removed (flat-branch model).
  _supabase: unknown,
  claims: JwtClaims,
  branchId: number,
): Promise<boolean> {
  // Area scope removed (flat-branch): the former per-area branch lookup against
  // the dropped area-scope table is gone. Access is now purely branch-scoped
  // (branch_id set) or tenant-wide (branch_id null, e.g. owner/manager).
  if (claims.branch_id != null) {
    return claims.branch_id === branchId;
  }

  return true;
}
