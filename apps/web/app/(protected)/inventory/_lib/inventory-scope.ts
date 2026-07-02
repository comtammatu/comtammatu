import { cache } from "react";
import { TENANT_LEVEL_ROLES, type JwtClaims } from "@comtammatu/shared/auth";
import {
  fetchActiveBranches,
  selectBranchScope,
  type OperatorBranchOption,
} from "@/_lib/branch-context";
import type { TenantSupabase } from "./types";

export type InventoryBranchOption = OperatorBranchOption;

export type InventoryBranchScope = {
  allowedBranches: InventoryBranchOption[];
  canSelectAll: boolean;
  selectedBranchId: number | null;
  defaultBranchId: number | null;
};

/**
 * Resolve which branches an inventory user can see + which one is currently
 * selected. URL `?branchId=` wins if allowed; otherwise fall back to the
 * user's home branch, else first allowed.
 *
 * Thin adapter over the shared branch-scope engine. Unlike operator scope,
 * inventory spans every active branch kind (warehouses, kitchens) and treats
 * owner + office as tenant-wide.
 */
export const resolveInventoryBranchScope = cache(
  async (
    supabase: TenantSupabase,
    claims: JwtClaims,
    requestedBranchId: number | null,
  ): Promise<InventoryBranchScope> => {
    const branches = await fetchActiveBranches(supabase, claims.tenant_id);
    return selectBranchScope(
      claims,
      branches,
      requestedBranchId,
      TENANT_LEVEL_ROLES,
    );
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
