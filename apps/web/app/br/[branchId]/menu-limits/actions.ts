"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

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
  const isHqRole = (
    ["owner", "super_manager", "area_manager"] as const
  ).includes(ctx.claims.user_role as never);
  if (!isHqRole && ctx.claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any).rpc(
    "list_branch_menu_daily_limits",
    {
      p_branch_id: parsedBranchId.data,
      p_limit_date: null,
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
  // null/undefined → no quantity cap (item still sells uncapped, unless disabled)
  limitQuantity: z
    .union([
      z.coerce
        .number()
        .int()
        .positive({ error: "Số lượng tối thiểu là 1" })
        .max(9999, { error: "Số lượng tối đa 9999" }),
      z.null(),
      z.undefined(),
    ])
    .optional(),
  isDisabled: z.boolean(),
});

export async function setBranchMenuDailyLimit(
  input: z.input<typeof setLimitSchema>,
): Promise<ActionResult<{ menu_item_id: number; limit_quantity: number | null; is_disabled: boolean; sold_today: number }>> {
  const parsed = setLimitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(LIMITS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const isHqRole = (
    ["owner", "super_manager", "area_manager"] as const
  ).includes(ctx.claims.user_role as never);
  if (!isHqRole && ctx.claims.branch_id !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const limitQty = parsed.data.limitQuantity ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any).rpc(
    "set_branch_menu_daily_limit",
    {
      p_branch_id: parsed.data.branchId,
      p_menu_item_id: parsed.data.menuItemId,
      p_limit_quantity: limitQty,
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
    return {
      success: false,
      error: "Không thể lưu hạn mức. Vui lòng thử lại.",
    };
  }

  revalidatePath(`/br/${parsed.data.branchId}/menu-limits`);
  revalidatePath(`/br/${parsed.data.branchId}/pos`);

  const row = (data ?? null) as
    | {
        menu_item_id: number;
        limit_quantity: number | null;
        is_disabled: boolean;
        sold_today: number;
      }
    | null;
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
): Promise<ActionResult<{ deleted: number }>> {
  const parsed = clearLimitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(LIMITS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const isHqRole = (
    ["owner", "super_manager", "area_manager"] as const
  ).includes(ctx.claims.user_role as never);
  if (!isHqRole && ctx.claims.branch_id !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any).rpc(
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

  const row = (data ?? { deleted: 0 }) as { deleted: number };
  return { success: true, data: row };
}
