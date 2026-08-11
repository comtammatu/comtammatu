"use server";

import { z } from "zod";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { inventoryNonzeroQuantitySchema } from "./_lib/inventory-quantity-schema";

/* ─── adjustStock ─── */

const adjustSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  entryUnitId: z.coerce.number().int().positive(),
  entryQuantity: inventoryNonzeroQuantitySchema,
  reason: z.string().trim().min(5, {
    error: "Nhập lý do điều chỉnh tối thiểu 5 ký tự.",
  }),
});

export const adjustStock = withAction(
  { roles: INVENTORY_OPS_ROLES, schema: adjustSchema, requireBranchScope: true },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { error } = await supabase.rpc("adjust_stock_exception", {
      p_branch_id: data.branchId,
      p_ingredient_id: data.ingredientId,
      p_entry_quantity: data.entryQuantity,
      p_entry_unit_id: data.entryUnitId,
      p_reason: data.reason,
    });

    if (error) {
      console.error(
        "[inventory/stock-actions:adjustStock] RPC adjust_stock_exception error:",
        error,
      );
      const msg = error.message ?? "";
      if (error.code === "42501" || msg.includes("forbidden")) {
        return {
          success: false,
          error: "Không có quyền điều chỉnh tồn kho.",
        };
      }
      if (msg.includes("quantity_change_nonzero")) {
        return {
          success: false,
          error: "Số lượng điều chỉnh không được bằng 0.",
        };
      }
      if (msg.includes("reason_required")) {
        return {
          success: false,
          error: "Nhập lý do điều chỉnh tối thiểu 5 ký tự.",
        };
      }
      if (msg.includes("default_issue_location_required")) {
        return {
          success: false,
          error: "Chi nhánh chưa có kho mặc định. Vui lòng liên hệ quản trị.",
        };
      }
      if (
        msg.includes("entry_unit_not_found") ||
        msg.includes("inventory_unit_role_mismatch")
      ) {
        return { success: false, error: "Đơn vị không thuộc nguyên liệu." };
      }
      return { success: false, error: "Không thể điều chỉnh tồn kho." };
    }

    return { success: true };
  },
);

/* ─── fetchStockIngredientDetailAction ─── */

const fetchDetailSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive().optional(),
});

export const fetchStockIngredientDetailAction = withAction(
  { roles: INVENTORY_OPS_ROLES, schema: fetchDetailSchema, requireBranchScope: false },
  async (data) => {
    const { loadStockIngredientDetailData } = await import(
      "@lib/inventory/stock-on-hand-detail-data"
    );
    const detailData = await loadStockIngredientDetailData({
      ingredientId: data.ingredientId,
      queryBranch: data.branchId ? String(data.branchId) : undefined,
    });
    return { success: true, data: detailData };
  },
);
