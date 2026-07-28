import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  isProductionBranchKind,
  isProductionBranchScopedRole,
  PRODUCTION_OPERATOR_ROLES,
} from "./production-roles";

/**
 * Shared scaffolding for the production action modules, split out of
 * production-actions.ts so recipe and order actions can use it independently.
 */

/** Route-level role gate for the production surface (RLS enforces fine authz). */
export const PRODUCTION_ROLES = PRODUCTION_OPERATOR_ROLES;

/** Roles whose scope is a single production site. */
export const isProductionSiteScopedRole = isProductionBranchScopedRole;

export const idSchema = z.coerce.number().int().positive();

export type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: {
      code?: string;
      message?: string;
      details?: string | null;
    } | null;
  }>;
};

export async function requireProductionBranch(
  supabase: unknown,
  tenantId: number,
  branchId: number,
) {
  const client = supabase as {
    from: (table: "branches") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          eq: (
            column: string,
            value: unknown,
          ) => {
            maybeSingle: () => PromiseLike<{
              data: { branch_kind: string | null } | null;
              error: { code?: string; message?: string } | null;
            }>;
          };
          maybeSingle: () => PromiseLike<{
            data: { branch_kind: string | null } | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", tenantId)
    .eq("id", branchId)
    .maybeSingle();

  if (error?.code === "42703") {
    return {
      ok: false,
      error: INVENTORY_VI.productionSiteMigrationRequired,
    };
  }

  if (error) {
    return {
      ok: false,
      error: INVENTORY_VI.productionSiteCheckFailed,
    };
  }

  // Production runs at the central kitchen OR at a branch (D091).
  if (!isProductionBranchKind(data?.branch_kind)) {
    return {
      ok: false,
      error: INVENTORY_VI.productionSiteRequired,
    };
  }

  return { ok: true };
}

/**
 * Access gate for production surfaces from the acting claims. A site-scoped
 * role must sit on a supported production site; a tenant-level central role
 * operates active central kitchens, so the gate only verifies one exists.
 * RLS and the production RPCs enforce fine-grained authz either way.
 */
export async function requireProductionAccess(
  supabase: unknown,
  claims: {
    tenant_id: number;
    branch_id: number | null;
    user_role: StaffRole;
  },
) {
  if (!isProductionSiteScopedRole(claims.user_role)) {
    return { ok: true };
  }

  if (claims.branch_id != null) {
    return requireProductionBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
  }

  const client = supabase as {
    from: (table: "branches") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          eq: (
            column: string,
            value: unknown,
          ) => {
            eq: (
              column: string,
              value: unknown,
            ) => {
              limit: (count: number) => {
                maybeSingle: () => PromiseLike<{
                  data: { id: number } | null;
                  error: { code?: string; message?: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };

  const { data, error } = await client
    .from("branches")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_kind", "central_kitchen")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: INVENTORY_VI.productionSiteCheckFailed,
    };
  }

  if (!data) {
    return { ok: false, error: INVENTORY_VI.productionSiteNoneConfigured };
  }

  return { ok: true };
}
