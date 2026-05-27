"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";
import {
  clearBranchMenuDailyLimit,
  setBranchMenuDailyLimit,
} from "../menu-limits/actions";

const ticketIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Phiếu bếp không hợp lệ" });

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const outOfStockSchema = z.object({
  ticketId: ticketIdSchema,
  branchId: branchIdSchema,
  disableForDay: z.boolean().default(true),
});

export async function markKdsItemOutOfStock(
  input: z.input<typeof outOfStockSchema>,
): Promise<
  ActionResult<{
    ticketId: number;
    orderId: number;
    orderItemId: number;
    menuItemId: number;
    itemName: string;
    disabledForDay: boolean;
    limitQuantity: number | null;
    isDisabled: boolean;
    soldToday: number;
  }>
> {
  const parsed = outOfStockSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(["chef", "branch_manager"]);
  if (!ctx) return { success: false, error: "Không có quyền" };

  if (
    ctx.claims.branch_id !== null &&
    ctx.claims.branch_id !== parsed.data.branchId
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // RPC is introduced by migration 20260601800000; cast until db:types is
  // regenerated from the schema where the migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any).rpc(
    "mark_kds_item_out_of_stock",
    {
      p_ticket_id: parsed.data.ticketId,
      p_disable_for_day: parsed.data.disableForDay,
      p_reason: "Hết món",
    },
  );

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("not_allowed") || msg.includes("forbidden")) {
      return { success: false, error: "Không có quyền báo hết món." };
    }
    if (msg.includes("order_already_paid")) {
      return {
        success: false,
        error: "Đơn đã thanh toán, không thể báo hết món.",
      };
    }
    if (msg.includes("order_terminal")) {
      return { success: false, error: "Đơn đã đóng, không thể báo hết món." };
    }
    if (msg.includes("item_not_out_of_stockable")) {
      return {
        success: false,
        error: "Chỉ báo hết món khi món còn đang chờ hoặc đang làm.",
      };
    }
    return {
      success: false,
      error: "Không thể báo hết món. Vui lòng thử lại.",
    };
  }

  const row = (data ?? null) as {
    ticket_id: number;
    order_id: number;
    order_item_id: number;
    menu_item_id: number;
    item_name: string;
    disabled_for_day: boolean;
    limit_quantity: number | null;
    is_disabled: boolean;
    sold_today: number;
  } | null;

  if (!row) {
    return {
      success: false,
      error: "Không thể báo hết món. Vui lòng thử lại.",
    };
  }

  revalidatePath(`/br/${parsed.data.branchId}/kds`);
  revalidatePath(`/br/${parsed.data.branchId}/pos`);
  revalidatePath(`/br/${parsed.data.branchId}/menu-limits`);

  return {
    success: true,
    data: {
      ticketId: row.ticket_id,
      orderId: row.order_id,
      orderItemId: row.order_item_id,
      menuItemId: row.menu_item_id,
      itemName: row.item_name,
      disabledForDay: row.disabled_for_day,
      limitQuantity: row.limit_quantity,
      isDisabled: row.is_disabled,
      soldToday: row.sold_today,
    },
  };
}

export async function setKdsMenuDailyLimit(
  input: Parameters<typeof setBranchMenuDailyLimit>[0],
): ReturnType<typeof setBranchMenuDailyLimit> {
  const result = await setBranchMenuDailyLimit(input);
  if (result.success) {
    revalidatePath(`/br/${input.branchId}/kds`);
  }
  return result;
}

export async function clearKdsMenuDailyLimit(
  input: Parameters<typeof clearBranchMenuDailyLimit>[0],
): ReturnType<typeof clearBranchMenuDailyLimit> {
  const result = await clearBranchMenuDailyLimit(input);
  if (result.success) {
    revalidatePath(`/br/${input.branchId}/kds`);
  }
  return result;
}
