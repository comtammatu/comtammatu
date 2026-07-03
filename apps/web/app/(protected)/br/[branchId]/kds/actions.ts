"use server";

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
} from "./_lib/completion-history";
import { fetchChunkedRows, uniqueNumbers } from "./_lib/query-helpers";

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

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
