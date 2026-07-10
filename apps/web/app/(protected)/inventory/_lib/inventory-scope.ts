import { cache } from "react";
import { TENANT_LEVEL_ROLES, type JwtClaims } from "@comtammatu/shared/auth";
import {
  fetchActiveBranches,
  parseBranchIdParam,
  resolveListScope,
  selectBranchScope,
  type ListScopeResolution,
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

export type InventoryListScope = ListScopeResolution;

/**
 * Single scope-read path for shared inventory `*PageContent` list/report
 * surfaces (D058 W3b). `routeBranchId` (validated URL segment, embedded
 * runtime) always wins over `queryBranchId` (raw `?branchId=`, office
 * display filter). Callers apply exactly one guard:
 * `if (scope.outOfScope) notFound();` — no more hand-rolled
 * `routeBranchId ?? resolveRequestedBranchId(...)` branching per page.
 */
export const resolveInventoryListScope = cache(
  async (
    supabase: TenantSupabase,
    claims: JwtClaims,
    options: {
      routeBranchId?: number;
      queryBranchId?: string | string[] | undefined;
    },
  ): Promise<InventoryListScope> => {
    const branches = await fetchActiveBranches(supabase, claims.tenant_id);
    return resolveListScope(supabase, claims, branches, {
      ...options,
      tenantWideRoles: TENANT_LEVEL_ROLES,
    });
  },
);

/**
 * Resolve scope from a single already-known branch id (no
 * `routeBranchId`/`?branchId=` pair to reconcile). Used by id-derived
 * detail pages, Server Actions, and the layout, which each already have
 * their own requested branch id and only need the allowed-branches /
 * default-selection lookup. List/report `*PageContent` surfaces that face
 * both an embedded segment and an office query param use
 * `resolveInventoryListScope` instead.
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

export { parseBranchIdParam };

/**
 * Async wrapper over `parseBranchIdParam` for call sites written before it
 * was exported synchronously from `@/_lib/branch-context`. Resolves the
 * requested branch id from URL only; inventory scope must not be
 * persisted in cookies/localStorage/context.
 */
export async function resolveRequestedBranchId(
  raw: string | string[] | undefined,
): Promise<number | null> {
  return parseBranchIdParam(raw);
}
