"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../../_lib/auth";
import { messages } from "@lib/messages";

const LIMITS_ROLES = MODULE_ACL.branch_menu_limits.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const menuItemIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Món không hợp lệ" });

export interface MenuLimitRow {
  menu_item_id: number;
  item_name: string;
  category_id: number;
  category_name: string;
  base_price: number;
  limit_id: number | null;
  limit_date: string | null;
  is_disabled: boolean;
  sold_today: number;
  stock_capacity: number | null;
  manual_limit_quantity: number | null;
  pending_unfinalized_demand: number;
  active_hold_demand: number;
  available_to_sell: number | null;
}

export async function fetchBranchMenuDailyLimits(
  branchId: number,
): Promise<ActionResult<MenuLimitRow[]>> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(LIMITS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  // Branch-scoped users can only inspect their own branch.
  const isHqRole = ctx.claims.user_role === "owner";
  if (!isHqRole && ctx.claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data, error } = await ctx.supabase.rpc(
    "list_branch_menu_daily_limits",
    {
      p_branch_id: parsedBranchId.data,
      // omit → RPC default (p_limit_date DATE DEFAULT NULL = today/all dates)
      p_limit_date: undefined,
    },
  );

  if (error) {
    return {
      success: false,
      error: messages.pos.menu.loadMenuLimitsFailed,
    };
  }

  const rows = (data ?? []) as MenuLimitRow[];
  return { success: true, data: rows };
}

const setLimitSchema = z.object({
  branchId: branchIdSchema,
  menuItemId: menuItemIdSchema,
  // null/undefined removes the manual cap; stock availability remains separate.
  limitQuantity: z
    .union([
      z.coerce
        .number()
        .int()
        .min(0, { error: "Số lượng tối thiểu là 0" })
        .max(9999, { error: "Số lượng tối đa 9999" }),
      z.null(),
      z.undefined(),
    ])
    .optional(),
  isDisabled: z.boolean(),
});

const replenishKitchenSchema = z.object({
  branchId: branchIdSchema,
  menuItemId: menuItemIdSchema,
  extraPortions: z.union([z.literal(1), z.literal(2)]),
  reason: z.string().trim().min(5, {
    error: "Nhập lý do bổ sung tối thiểu 5 ký tự.",
  }),
});

export async function setBranchMenuDailyLimit(
  input: z.input<typeof setLimitSchema>,
): Promise<
  ActionResult<{
    menu_item_id: number;
    limit_quantity: number | null;
    is_disabled: boolean;
    sold_today: number;
  }>
> {
  const parsed = setLimitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(LIMITS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const isHqRole = ctx.claims.user_role === "owner";
  if (!isHqRole && ctx.claims.branch_id !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const limitQty = parsed.data.limitQuantity ?? null;

  const { data, error } = await ctx.supabase.rpc(
    "set_branch_menu_daily_limit",
    {
      p_branch_id: parsed.data.branchId,
      p_menu_item_id: parsed.data.menuItemId,
      // The generated RPC type does not express the nullable SQL parameter.
      p_limit_quantity: limitQty as number,
      p_is_disabled: parsed.data.isDisabled,
    },
  );

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("forbidden") || msg.includes("scope mismatch")) {
      return { success: false, error: "Không có quyền chỉnh hạn mức." };
    }
    if (msg.includes("not found")) {
      return { success: false, error: "Không tìm thấy món hoặc chi nhánh." };
    }
    if (msg.includes("nonnegative")) {
      return {
        success: false,
        error: "Giới hạn bán phải là số nguyên từ 0 đến 9999.",
      };
    }
    return {
      success: false,
      error: "Không thể lưu hạn mức. Vui lòng thử lại.",
    };
  }

  revalidatePath(`/br/${parsed.data.branchId}/menu-limits`);
  revalidatePath(`/br/${parsed.data.branchId}/pos`);
  revalidatePath(`/br/${parsed.data.branchId}/kds`);

  const row = (data ?? null) as {
    menu_item_id: number;
    limit_quantity: number | null;
    is_disabled: boolean;
    sold_today: number;
  } | null;
  if (!row) {
    return {
      success: false,
      error: "Không thể lưu hạn mức. Vui lòng thử lại.",
    };
  }

  return { success: true, data: row };
}

const clearLimitSchema = z.object({
  branchId: branchIdSchema,
  menuItemId: menuItemIdSchema,
});

export async function clearBranchMenuDailyLimit(
  input: z.input<typeof clearLimitSchema>,
): Promise<ActionResult<{ deleted: number; cleared?: number }>> {
  const parsed = clearLimitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(LIMITS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const isHqRole = ctx.claims.user_role === "owner";
  if (!isHqRole && ctx.claims.branch_id !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data, error } = await ctx.supabase.rpc(
    "clear_branch_menu_daily_limit",
    {
      p_branch_id: parsed.data.branchId,
      p_menu_item_id: parsed.data.menuItemId,
    },
  );

  if (error) {
    return {
      success: false,
      error: "Không thể bỏ hạn mức. Vui lòng thử lại.",
    };
  }

  revalidatePath(`/br/${parsed.data.branchId}/menu-limits`);
  revalidatePath(`/br/${parsed.data.branchId}/pos`);
  revalidatePath(`/br/${parsed.data.branchId}/kds`);

  const row = (data ?? { deleted: 0 }) as { deleted: number; cleared?: number };
  return { success: true, data: row };
}

export async function replenishMenuItemKitchenStock(
  input: z.input<typeof replenishKitchenSchema>,
): Promise<
  ActionResult<{
    portions_added: number;
    movements_created: number;
    stock_capacity: number | null;
  }>
> {
  const parsed = replenishKitchenSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(LIMITS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const isHqRole = ctx.claims.user_role === "owner";
  if (!isHqRole && ctx.claims.branch_id !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data, error } = await ctx.supabase.rpc(
    "add_menu_item_kitchen_stock_exception",
    {
      p_branch_id: parsed.data.branchId,
      p_menu_item_id: parsed.data.menuItemId,
      p_extra_portions: parsed.data.extraPortions,
      p_reason: parsed.data.reason,
    },
  );

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("forbidden") || msg.includes("scope mismatch")) {
      return {
        success: false,
        error: "Không có quyền bổ sung tồn kho chi nhánh.",
      };
    }
    if (msg.includes("extra_portions_range")) {
      return { success: false, error: "Chỉ bổ sung 1 hoặc 2 suất mỗi lần." };
    }
    if (msg.includes("reason_required")) {
      return {
        success: false,
        error: "Nhập lý do bổ sung tối thiểu 5 ký tự.",
      };
    }
    if (
      msg.includes("branch_not_found") ||
      msg.includes("menu_item_not_found")
    ) {
      return { success: false, error: "Không tìm thấy món hoặc chi nhánh." };
    }
    if (
      msg.includes("branch_warehouse_required") ||
      msg.includes("default_warehouse_location_required") ||
      msg.includes("branch_kitchen_required") ||
      msg.includes("default_kitchen_location_required")
    ) {
      return {
        success: false,
        error: "Chi nhánh chưa cấu hình Kho chi nhánh.",
      };
    }
    if (
      msg.includes("menu_recipe_required") ||
      msg.includes("recipe_unit_config_required") ||
      msg.includes("entry_unit_not_found") ||
      msg.includes("recipe_ingredient_inactive") ||
      msg.includes("no_positive_recipe_quantity")
    ) {
      return {
        success: false,
        error: "Chưa đủ định mức nguyên liệu để bổ sung tồn kho chi nhánh.",
      };
    }

    console.error(
      "[menu-limits:replenishMenuItemKitchenStock] [unmapped] rpc error:",
      error,
    );
    return {
      success: false,
      error: "Không thể bổ sung tồn kho chi nhánh. Vui lòng thử lại.",
    };
  }

  revalidatePath(`/br/${parsed.data.branchId}/menu-limits`);
  revalidatePath(`/br/${parsed.data.branchId}/pos`);
  revalidatePath(`/br/${parsed.data.branchId}/kds`);

  const row = (data ?? null) as {
    portions_added?: number;
    movements_created?: number;
    stock_capacity?: number | null;
  } | null;

  return {
    success: true,
    data: {
      portions_added: row?.portions_added ?? parsed.data.extraPortions,
      movements_created: row?.movements_created ?? 0,
      stock_capacity: row?.stock_capacity ?? null,
    },
  };
}
