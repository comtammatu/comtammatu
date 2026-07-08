"use server";

import { z } from "zod";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { PG_ERR } from "./_lib/constants";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";

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
    const resolvedUnit = await resolveEntryUnitCode(supabase, {
      tenantId: claims.tenant_id,
      ingredientId: data.ingredientId,
      entryUnitId: null,
    });
    if (!resolvedUnit.success) {
      return { success: false, error: resolvedUnit.error };
    }

    const { error } = await supabase.from("stock_movements").insert({
      tenant_id: claims.tenant_id,
      branch_id: data.branchId,
      ingredient_id: data.ingredientId,
      type: data.type,
      quantity_change: data.quantityChange,
      entry_unit_id: resolvedUnit.unitId,
      entry_quantity: Math.abs(data.quantityChange),
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
