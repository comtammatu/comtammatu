"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../../_lib/auth";

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
  limit_quantity: number | null;
  is_disabled: boolean;
  sold_today: number;
  stock_capacity: number | null;
  stock_capacity_live: number | null;
  manual_limit_quantity: number | null;
  accepted_today: number;
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
      error: "Không thể tải hạn mức bán. Vui lòng thử lại.",
    };
  }

  const rows = (data ?? []) as MenuLimitRow[];
  return { success: true, data: rows };
}

const setLimitSchema = z.object({
  branchId: branchIdSchema,
  menuItemId: menuItemIdSchema,
  // null/undefined → backend defaults Sẵn bán to the computed stock capacity.
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
      // null = default to stock capacity; typegen still types the INT param
      // non-null because there is no SQL default, so assert here.
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
    if (msg.includes("exceeds stock capacity")) {
      return { success: false, error: "Sẵn bán không được vượt Tồn." };
    }
    if (msg.includes("nonnegative")) {
      return {
        success: false,
        error: "Sẵn bán phải là số nguyên từ 0 đến 9999.",
      };
    }
    if (msg.includes("stock capacity required")) {
      return { success: false, error: "Chưa tính được Tồn để đặt Sẵn bán." };
    }
    return {
      success: false,
      error: "Không thể lưu hạn mức. Vui lòng thử lại.",
    };
  }

  revalidatePath(`/br/${parsed.data.branchId}/settings/menu-limits`);
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

  revalidatePath(`/br/${parsed.data.branchId}/settings/menu-limits`);
  revalidatePath(`/br/${parsed.data.branchId}/pos`);
  revalidatePath(`/br/${parsed.data.branchId}/kds`);

  const row = (data ?? { deleted: 0 }) as { deleted: number; cleared?: number };
  return { success: true, data: row };
}
