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
  .positive({ error: "Mã chi nhánh không hợp lệ" });

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
  stock_allowance_quantity: number | null;
  pending_unfinalized_demand: number;
  active_hold_demand: number;
  available_to_sell: number | null;
}

export async function fetchBranchMenuDailyLimits(
  branchId: number,
): Promise<ActionResult<MenuLimitRow[]>> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Mã chi nhánh không hợp lệ" };
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

// Do not z.coerce.number() here: Number(null) and Number("") are 0, which
// would turn "clear the cap" into a hard zero quota.
const nullableLimitQuantitySchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.union([
    z.null(),
    z
      .number({ error: "Giới hạn bán phải là số nguyên từ 0 đến 9999." })
      .int({ error: "Giới hạn bán phải là số nguyên từ 0 đến 9999." })
      .min(0, { error: "Số lượng tối thiểu là 0" })
      .max(9999, { error: "Số lượng tối đa 9999" }),
  ]),
);

const setLimitSchema = z.object({
  branchId: branchIdSchema,
  menuItemId: menuItemIdSchema,
  // null removes the manual cap; stock availability remains separate.
  limitQuantity: nullableLimitQuantitySchema,
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
      // Generated Args type is non-null; SQL accepts NULL = no manual cap.
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

const stockAllowanceSchema = z.object({
  branchId: branchIdSchema,
  menuItemId: menuItemIdSchema,
  stockAllowanceQuantity: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.union([
      z.null(),
      z
        .number({ error: "Số phần bán thêm phải là số nguyên từ 0 đến 9999." })
        .int({ error: "Số phần bán thêm phải là số nguyên từ 0 đến 9999." })
        .min(0, { error: "Số phần tối thiểu là 0" })
        .max(9999, { error: "Số phần tối đa 9999" }),
    ]),
  ),
});

export async function setBranchMenuStockAllowance(
  input: z.input<typeof stockAllowanceSchema>,
): Promise<
  ActionResult<{
    menu_item_id: number;
    stock_allowance_quantity: number | null;
  }>
> {
  const parsed = stockAllowanceSchema.safeParse(input);
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

  const allowance = parsed.data.stockAllowanceQuantity ?? null;

  const { data, error } = await ctx.supabase.rpc(
    "set_branch_menu_stock_allowance" as never,
    {
      p_branch_id: parsed.data.branchId,
      p_menu_item_id: parsed.data.menuItemId,
      p_stock_allowance_quantity: allowance as number,
    } as never,
  );

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("forbidden") || msg.includes("scope mismatch")) {
      return { success: false, error: "Không có quyền chỉnh cho phép bán thêm." };
    }
    if (msg.includes("not found")) {
      return { success: false, error: "Không tìm thấy món hoặc chi nhánh." };
    }
    if (msg.includes("nonnegative")) {
      return {
        success: false,
        error: messages.pos.menu.stockAllowanceRange,
      };
    }
    return {
      success: false,
      error: messages.pos.menu.stockAllowanceSaveFailed,
    };
  }

  revalidatePath(`/br/${parsed.data.branchId}/menu-limits`);
  revalidatePath(`/br/${parsed.data.branchId}/pos`);
  revalidatePath(`/br/${parsed.data.branchId}/kds`);

  const row = (data ?? null) as {
    menu_item_id: number;
    stock_allowance_quantity: number | null;
  } | null;
  if (!row) {
    return {
      success: false,
      error: messages.pos.menu.stockAllowanceSaveFailed,
    };
  }

  return { success: true, data: row };
}

/**
 * Menu-limits UI treats stock allowance as a switch. The RPC remains an
 * integer headroom (ADR 0026). ON writes the schema max so stock remaining
 * plus allowance reopens the sell path; OFF clears the field.
 */
const STOCK_ALLOWANCE_SWITCH_ON_QUANTITY = 9999;

export async function setBranchMenuStockAllowanceEnabled(input: {
  branchId: number;
  menuItemId: number;
  enabled: boolean;
}): Promise<
  ActionResult<{
    menu_item_id: number;
    stock_allowance_quantity: number | null;
  }>
> {
  return setBranchMenuStockAllowance({
    branchId: input.branchId,
    menuItemId: input.menuItemId,
    stockAllowanceQuantity: input.enabled
      ? STOCK_ALLOWANCE_SWITCH_ON_QUANTITY
      : null,
  });
}
