import type { JwtClaims } from "@comtammatu/shared/auth";

export async function canAccessBranch(
  // Supabase client type is intentionally loose here to avoid
  // deep generic instantiation across generated Database types.
  supabase: unknown,
  claims: JwtClaims,
  branchId: number,
): Promise<boolean> {
  if (claims.user_role === "area_manager") {
    if (claims.area_id == null) return false;

    type Query = {
      eq: (column: string, value: unknown) => Query;
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    };

    const sb = supabase as {
      from: (table: "area_branches") => {
        select: (columns: "id") => Query;
      };
    };

    const { data, error } = await sb
      .from("area_branches")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("area_id", claims.area_id)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (error) return false;
    return Boolean(data);
  }

  // Branch-scoped roles must match their own branch.
  if (claims.branch_id != null) {
    return claims.branch_id === branchId;
  }

  // Tenant-wide roles (owner/super_manager/office) have no branch constraint.
  return true;
}
