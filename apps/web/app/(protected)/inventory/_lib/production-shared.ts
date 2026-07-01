import { z } from "zod";
import {
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
      error: "Cần áp dụng migration điểm vận hành trước khi dùng màn này.",
    };
  }

  if (error) {
    return {
      ok: false,
      error: "Không thể kiểm tra quyền truy cập Bếp Trung Tâm.",
    };
  }

  if (data?.branch_kind !== "central_kitchen") {
    return {
      ok: false,
      error: "Chỉ Bếp Trung Tâm mới được phép tạo lệnh sản xuất.",
    };
  }

  return { ok: true };
}
