import { z } from "zod";
import {
  isProductionBranchScopedRole,
  PRODUCTION_OPERATOR_ROLES,
} from "./production-roles";

/**
 * Shared scaffolding for the production (central-kitchen) action modules,
 * split out of production-actions.ts (WS-3) so both production-recipe-actions
 * and production-order-actions can use it without one importing the other.
 */

/** Route-level role gate for the production surface (RLS enforces fine authz). */
export const PRODUCTION_ROLES = PRODUCTION_OPERATOR_ROLES;

/** Roles whose scope is a single branch → must be pinned to a central_kitchen. */
export const isCentralKitchenScopedRole = isProductionBranchScopedRole;

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

export async function requireCentralKitchenBranch(
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
      error:
        "Cần áp dụng migration `branch_kind` trước khi dùng màn Bếp trung tâm.",
    };
  }

  if (error) {
    return {
      ok: false,
      error: "Không thể kiểm tra quyền truy cập bếp trung tâm.",
    };
  }

  if (data?.branch_kind !== "central_kitchen") {
    return {
      ok: false,
      error: "Chỉ bếp trung tâm mới được phép thao tác ở màn này.",
    };
  }

  return { ok: true };
}
