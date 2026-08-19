"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { inventoryNonzeroQuantitySchema } from "./_lib/inventory-quantity-schema";
import { mapInventoryRpcFailure } from "./_lib/rpc-failure";
import {
  INVENTORY_ERROR_CODES,
  ownerSetCompanyWacRpcFallback,
  ownerSetCompanyWacRpcMappings,
} from "@lib/messages/inventory-rpc-errors";

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

const ownerSetCompanyWacSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().gt(0).max(99_999_999_999.99),
  reason: z.string().trim().min(10).max(500),
  idempotencyKey: z.string().uuid(),
});

const ownerSetCompanyWacResultSchema = z.object({
  ingredient_id: z.coerce.number().int().positive(),
  company_wac: z.coerce.number(),
  quantity_delta: z.coerce.number(),
  on_hand_quantity: z.coerce.number(),
});

export const ownerSetCompanyWac = withAction(
  {
    roles: ["owner"] as const,
    schema: ownerSetCompanyWacSchema,
    forbiddenError: "Chỉ Chủ sở hữu được ghi Giá vốn.",
    forbiddenErrorCode: INVENTORY_ERROR_CODES.FORBIDDEN,
  },
  async (data, { supabase }) => {
    const { data: raw, error } = await supabase.rpc(
      "owner_set_company_wac" as never,
      {
        p_ingredient_id: data.ingredientId,
        p_unit_cost: data.unitCost,
        p_reason: data.reason,
        p_idempotency_key: data.idempotencyKey,
      } as never,
    );
    if (error) {
      return mapInventoryRpcFailure(
        error,
        ownerSetCompanyWacRpcMappings,
        ownerSetCompanyWacRpcFallback,
      );
    }
    const parsed = ownerSetCompanyWacResultSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        success: false,
        error: ownerSetCompanyWacRpcFallback.userMessage,
        errorCode: INVENTORY_ERROR_CODES.COMPANY_WAC_SET_FAILED,
      };
    }
    revalidatePath("/inventory/stock");
    return {
      success: true as const,
      data: {
        ingredientId: parsed.data.ingredient_id,
        companyWac: parsed.data.company_wac,
        quantityDelta: parsed.data.quantity_delta,
        onHandQuantity: parsed.data.on_hand_quantity,
      },
    };
  },
);
