"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContext } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { PG_ERR } from "./_lib/constants";

/* ─── Stock levels + manual adjustment ─── */

export async function fetchStockLevels(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranch = z.coerce.number().int().positive().safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("stock_levels")
    .select(
      `
      id,
      current_quantity,
      avg_unit_cost,
      last_counted_at,
      ingredient_id,
      ingredients (
        id, name, unit, category, min_stock_level, max_stock_level, is_active
      )
    `,
    )
    .eq("branch_id", parsedBranch.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể tải tồn kho." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── adjustStock ─── */

const adjustSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantityChange: z.coerce.number(),
  type: z.enum(["adjustment", "count_adjustment"]),
  reason: z.string().optional(),
});

export const adjustStock = withAction(
  { roles: INVENTORY_OPS_ROLES, schema: adjustSchema, requireBranchScope: true },
  async (data, { supabase, claims, user }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: hasWritePermission, error: permissionError } =
      await supabase.rpc("has_permission", {
        p_branch_id: data.branchId,
        p_key: PERMISSION_KEYS.INVENTORY_WRITE,
      });
    if (permissionError || hasWritePermission !== true) {
      return {
        success: false,
        error: "Không có quyền điều chỉnh tồn kho.",
      };
    }

    const defaultLocationId = await resolveDefaultInventoryLocation(
      supabase,
      claims.tenant_id,
      data.branchId,
      "issue",
    );
    if (defaultLocationId == null) {
      return {
        success: false,
        error: "Chi nhánh chưa có kho mặc định. Vui lòng liên hệ quản trị.",
      };
    }

    const { error } = await supabase.from("stock_movements").insert({
      tenant_id: claims.tenant_id,
      branch_id: data.branchId,
      ingredient_id: data.ingredientId,
      type: data.type,
      quantity_change: data.quantityChange,
      reason: data.reason ?? null,
      created_by: user.id,
      location_id: defaultLocationId,
    });

    if (error) {
      if (error.code === PG_ERR.CHECK_VIOLATION) {
        return {
          success: false,
          error: "Không thể điều chỉnh tồn kho do vi phạm ràng buộc dữ liệu.",
        };
      }
      return { success: false, error: "Không thể điều chỉnh tồn kho." };
    }

    return { success: true };
  },
);

/* ─── fetchStockAlerts ─── */

