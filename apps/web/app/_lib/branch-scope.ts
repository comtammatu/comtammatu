import type { JwtClaims } from "@comtammatu/shared/auth";

export interface BranchSwitcherOption {
  id: number;
  name: string;
}

/**
 * Resolve the active branches the current user may switch to, used by the
 * global `BranchSwitcher` in the app shell. Owner (claims.branch_id === null)
 * sees every active tenant branch; branch-scoped roles see only their own
 * assigned branch — so the switcher hides itself (≤1 option) for single-branch
 * users. Scope stays derived from JWT claims, never persisted client-side.
 */
export async function resolveBranchSwitcherOptions(
  // Supabase client type is intentionally loose here to avoid deep generic
  // instantiation across generated Database types (matches canAccessBranch).
  supabase: unknown,
  claims: JwtClaims,
): Promise<BranchSwitcherOption[]> {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          order: (
            column: string,
          ) => Promise<{ data: BranchSwitcherOption[] | null }>;
        };
      };
    };
  };

  const { data } = await client
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const branches = data ?? [];

  if (claims.user_role !== "owner" && claims.branch_id != null) {
    return branches.filter((branch) => branch.id === claims.branch_id);
  }

  return branches;
}

export async function canAccessBranch(
  // Supabase client type is intentionally loose here to avoid
  // deep generic instantiation across generated Database types.
  supabase: unknown,
  claims: JwtClaims,
  branchId: number,
): Promise<boolean> {
  void supabase;

  if (claims.user_role === "owner") {
    return true;
  }

  if (claims.branch_id != null) {
    return claims.branch_id === branchId;
  }

  return true;
}
