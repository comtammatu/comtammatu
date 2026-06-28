"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import { getAuthContext } from "../../_lib/auth";
import {
  buildKdsCompletionHistory,
  type KdsCompletionHistoryBatch,
  type KdsCompletionHistoryEntry,
  type KdsCompletionHistoryOrderInfo,
  type KdsCompletionHistoryOrderItem,
  type KdsCompletionHistoryTicket,
} from "./lib/completion-history";
import { fetchChunkedRows, uniqueNumbers } from "./lib/query-helpers";

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

const completionHistorySchema = z.object({
  branchId: branchIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const KDS_COMPLETION_TICKET_SELECT =
  "id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at";
const KDS_COMPLETION_ORDER_SELECT =
  "id, order_number, order_type, table_id, created_at, tables(number)";
const KDS_COMPLETION_ITEM_SELECT =
  "id, order_id, item_name, quantity, status";
const KDS_COMPLETION_BATCH_SELECT =
  "id, order_id, kitchen_ticket_number, send_seq, kind, created_at";
const KDS_COMPLETED_TICKET_STATUSES = ["ready", "served"];

function normalizeCompletionOrders(
  rows: unknown[] | null | undefined,
): KdsCompletionHistoryOrderInfo[] {
  return (
    (rows ?? []) as Array<
      Omit<KdsCompletionHistoryOrderInfo, "tables"> & {
        tables?: { number: number } | { number: number }[] | null;
      }
    >
  ).map((row) => ({
    ...row,
    tables: Array.isArray(row.tables)
      ? (row.tables[0] ?? null)
      : (row.tables ?? null),
  }));
}

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

  const { data, error } = await ctx.supabase.rpc(
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
  revalidatePath(`/br/${parsed.data.branchId}/settings/menu-limits`);

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

export async function fetchKdsCompletionHistory(
  input: z.input<typeof completionHistorySchema>,
): Promise<ActionResult<KdsCompletionHistoryEntry[]>> {
  const parsed = completionHistorySchema.safeParse(input);
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

  const { startIso: todayStartIso } = getVNDayUtcRange(getVNDateString());
  const ticketReadLimit = Math.min(parsed.data.limit * 12, 1000);
  const { data: ticketRows, error: ticketError } = await ctx.supabase
    .from("kds_tickets")
    .select(KDS_COMPLETION_TICKET_SELECT)
    .eq("branch_id", parsed.data.branchId)
    .in("status", KDS_COMPLETED_TICKET_STATUSES)
    .not("bumped_at", "is", null)
    .gte("bumped_at", todayStartIso)
    .order("bumped_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(ticketReadLimit);

  if (ticketError) {
    return {
      success: false,
      error: "Không thể tải lịch sử hoàn thành. Vui lòng thử lại.",
    };
  }

  const tickets = (ticketRows ?? []) as KdsCompletionHistoryTicket[];
  if (tickets.length === 0) {
    return { success: true, data: [] };
  }

  const orderIds = uniqueNumbers(tickets.map((ticket) => ticket.order_id));
  const orderItemIds = uniqueNumbers(
    tickets.map((ticket) => ticket.order_item_id),
  );
  const batchIds = uniqueNumbers(
    tickets
      .map((ticket) => ticket.kitchen_send_batch_id)
      .filter((id): id is number => id !== null),
  );

  const [ordersResult, itemsResult, batchesResult] = await Promise.all([
    fetchChunkedRows<unknown>(orderIds, async (ids) => {
      const { data, error } = await ctx.supabase
        .from("orders")
        .select(KDS_COMPLETION_ORDER_SELECT)
        .eq("branch_id", parsed.data.branchId)
        .in("id", ids);
      return { data: data ?? null, error };
    }),
    fetchChunkedRows<KdsCompletionHistoryOrderItem>(
      orderItemIds,
      async (ids) => {
        const { data, error } = await ctx.supabase
          .from("order_items")
          .select(KDS_COMPLETION_ITEM_SELECT)
          .in("id", ids);
        return {
          data: (data ?? null) as KdsCompletionHistoryOrderItem[] | null,
          error,
        };
      },
    ),
    fetchChunkedRows<KdsCompletionHistoryBatch>(batchIds, async (ids) => {
      const { data, error } = await ctx.supabase
        .from("kitchen_send_batches")
        .select(KDS_COMPLETION_BATCH_SELECT)
        .in("id", ids);
      return {
        data: (data ?? null) as KdsCompletionHistoryBatch[] | null,
        error,
      };
    }),
  ]);

  if (ordersResult.error || itemsResult.error || batchesResult.error) {
    return {
      success: false,
      error: "Không thể tải chi tiết lịch sử hoàn thành. Vui lòng thử lại.",
    };
  }

  return {
    success: true,
    data: buildKdsCompletionHistory({
      tickets,
      orders: normalizeCompletionOrders(ordersResult.data),
      items: itemsResult.data ?? [],
      batches: batchesResult.data ?? [],
      limit: parsed.data.limit,
    }),
  };
}
