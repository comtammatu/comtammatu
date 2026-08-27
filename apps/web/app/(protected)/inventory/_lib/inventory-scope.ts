import { cache } from "react";
import {
  INVENTORY_TENANT_READ_ROLES,
  type JwtClaims,
} from "@comtammatu/shared/auth";
import {
  fetchActiveBranches,
  parseBranchIdParam,
  resolveListScope,
  selectBranchScope,
  type ListScopeResolution,
  type OperatorBranchOption,
} from "@/_lib/branch-context";
import type { TenantSupabase } from "@lib/inventory/types";

export type InventoryBranchOption = OperatorBranchOption;

export type InventoryBranchScope = {
  allowedBranches: InventoryBranchOption[];
  canSelectAll: boolean;
  scopeMode: "all" | "site";
  selectedBranchId: number | null;
  defaultBranchId: number | null;
};

export type InventoryListScope = ListScopeResolution;

/**
 * Single scope-read path for shared inventory `*PageContent` list/report
 * surfaces (D058 W3b). `routeBranchId` (validated URL segment, embedded
 * runtime) always wins over query `?branch=`. Callers apply exactly one
 * guard: `if (scope.outOfScope) notFound();`.
 */
export const resolveInventoryListScope = cache(
  async (
    supabase: TenantSupabase,
    claims: JwtClaims,
    options: {
      routeBranchId?: number;
      queryBranch?: string | string[] | undefined;
    },
  ): Promise<InventoryListScope> => {
    const branches = await fetchActiveBranches(supabase, claims.tenant_id);
    return resolveListScope(supabase, claims, branches, {
      ...options,
      tenantWideRoles: INVENTORY_TENANT_READ_ROLES,
    });
  },
);

/**
 * Resolve scope from a single already-known branch id (no
 * `routeBranchId`/`?branch=` pair to reconcile). Used by id-derived
 * detail pages, Server Actions, and the layout.
 */
export const resolveInventoryBranchScope = cache(
  async (
    supabase: TenantSupabase,
    claims: JwtClaims,
    requestedBranchId: number | null,
    options?: { requestAll?: boolean },
  ): Promise<InventoryBranchScope> => {
    const branches = await fetchActiveBranches(supabase, claims.tenant_id);
    return selectBranchScope(
      claims,
      branches,
      requestedBranchId,
      INVENTORY_TENANT_READ_ROLES,
      options,
    );
  },
);

export { parseBranchIdParam };

/**
 * Async wrapper over `parseBranchIdParam` for call sites written before it
 * was exported synchronously from `@/_lib/branch-context`. Resolves a
 * concrete site id from URL only; aggregate tokens yield null.
 */
export async function resolveRequestedBranchId(
  raw: string | string[] | undefined,
): Promise<number | null> {
  return parseBranchIdParam(raw);
}
