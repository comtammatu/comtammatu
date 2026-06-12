import { cache } from "react";
import type { JwtClaims } from "@comtammatu/shared/auth";
import type { TenantSupabase } from "./types";

export type InventoryBranchOption = {
  id: number;
  name: string;
  branch_kind: string;
};

export type InventoryBranchScope = {
  allowedBranches: InventoryBranchOption[];
  canSelectAll: boolean;
  selectedBranchId: number | null;
  defaultBranchId: number | null;
};

const TENANT_WIDE_ROLES = new Set(["owner", "super_manager", "office"]);

const fetchAllActiveBranches = cache(
  async (
    supabase: TenantSupabase,
    tenantId: number,
  ): Promise<InventoryBranchOption[]> => {
    const { data, error } = await supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("id");
    if (error) return [];
    return data ?? [];
  },
);

function pickDefault(
  branches: InventoryBranchOption[],
  preferred: number | null,
): number | null {
  if (preferred != null && branches.some((b) => b.id === preferred)) {
    return preferred;
  }
  return branches[0]?.id ?? null;
}

/**
 * Resolve which branches an inventory user can see + which one is currently
 * selected. URL `?branchId=` wins if allowed; otherwise fall back to the
 * user's home branch, else first allowed.
 *
 * - owner / super_manager / office → every active tenant branch
 * - other roles                    → locked to `claims.branch_id`
 */
export const resolveInventoryBranchScope = cache(
  async (
    supabase: TenantSupabase,
    claims: JwtClaims,
    requestedBranchId: number | null,
  ): Promise<InventoryBranchScope> => {
    let allowedBranches: InventoryBranchOption[] = [];
    let canSelectAll = false;

    if (TENANT_WIDE_ROLES.has(claims.user_role)) {
      allowedBranches = await fetchAllActiveBranches(
        supabase,
        claims.tenant_id,
      );
      canSelectAll = true;
    } else if (claims.branch_id != null) {
      const allBranches = await fetchAllActiveBranches(
        supabase,
        claims.tenant_id,
      );
      const own = allBranches.find((b) => b.id === claims.branch_id);
      if (own) allowedBranches = [own];
      canSelectAll = false;
    }

    const defaultBranchId = pickDefault(allowedBranches, claims.branch_id);

    let selectedBranchId = defaultBranchId;
    if (
      requestedBranchId != null &&
      allowedBranches.some((b) => b.id === requestedBranchId)
    ) {
      selectedBranchId = requestedBranchId;
    }

    return {
      allowedBranches,
      canSelectAll,
      selectedBranchId,
      defaultBranchId,
    };
  },
);

/**
 * Parse a raw `branchId` query-param value. Returns null for missing or
 * malformed values (non-numeric, ≤0). Callers pass result into
 * `resolveInventoryBranchScope` which does the authorization check.
 */
export function parseBranchIdParam(
  raw: string | string[] | undefined,
): number | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Resolve the requested branch id from URL only.
 * Inventory scope must not be persisted in cookies/localStorage/context.
 * Server pages should pass this value into `resolveInventoryBranchScope`,
 * which performs the authorization check and default fallback.
 */
export async function resolveRequestedBranchId(
  raw: string | string[] | undefined,
): Promise<number | null> {
  return parseBranchIdParam(raw);
}
