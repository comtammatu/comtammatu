"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import { KDS_VI } from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import { getAuthContext } from "../../_lib/auth";
import {
  buildKdsOperationalHistory,
  type KdsCompletionHistoryEvent,
  type KdsCompletionHistoryOrderInfo,
  type KdsOperationalHistoryEntry,
} from "./_lib/completion-history";
import { fetchChunkedRows, uniqueNumbers } from "./_lib/query-helpers";

const KDS_ROLES = MODULE_ACL.kds.allowedRoles;

export interface KdsOperationalHistoryResult {
  entries: KdsOperationalHistoryEntry[];
  truncated: boolean;
}

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Mã chi nhánh không hợp lệ" });

const completionHistorySchema = z.object({
  branchId: branchIdSchema,
  date: z.string().date().default(getVNDateString()),
  eventType: z
    .enum([
      "all",
      "sent",
      "preparing",
      "completed",
      "recalled",
      "served",
      "cancelled",
      "out_of_stock",
    ])
    .default("all"),
  limit: z.coerce.number().int().min(1).max(250).default(100),
});

const KDS_COMPLETION_ORDER_SELECT =
  "id, order_number, order_type, table_id, created_at, delivery_platform, external_order_ref, tables(number)";

type KdsHistoryRpc = (
  name: "get_kds_ticket_history",
  args: {
    p_branch_id: number;
    p_from: string;
    p_to: string | null;
    p_limit: number;
    p_before_at: string | null;
    p_before_id: number | null;
    p_order_id: number | null;
    p_event_type: KdsCompletionHistoryEvent["event_type"] | null;
  },
) => Promise<{
  data: KdsCompletionHistoryEvent[] | null;
  error: { message: string } | null;
}>;

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
): Promise<ActionResult<KdsOperationalHistoryResult>> {
  const parsed = completionHistorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  if (
    ctx.claims.branch_id !== null &&
    ctx.claims.branch_id !== parsed.data.branchId
  ) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { startIso, endIso } = getVNDayUtcRange(parsed.data.date);
  const historyRpc = ctx.supabase.rpc.bind(
    ctx.supabase,
  ) as unknown as KdsHistoryRpc;
  const { data: eventRows, error: eventError } = await historyRpc(
    "get_kds_ticket_history",
    {
      p_branch_id: parsed.data.branchId,
      p_from: startIso,
      p_to: endIso,
      p_limit: parsed.data.limit + 1,
      p_before_at: null,
      p_before_id: null,
      p_order_id: null,
      p_event_type:
        parsed.data.eventType === "all" ? null : parsed.data.eventType,
    },
  );

  if (eventError) {
    return {
      success: false,
      error: KDS_VI.completionHistoryLoadFailed,
    };
  }

  const events = (eventRows ?? []).slice(0, parsed.data.limit);
  const truncated = (eventRows?.length ?? 0) > parsed.data.limit;
  if (events.length === 0) {
    return { success: true, data: { entries: [], truncated: false } };
  }

  const orderIds = uniqueNumbers(events.map((event) => event.order_id));

  const ordersResult = await fetchChunkedRows<unknown>(
    orderIds,
    async (ids) => {
      const { data, error } = await ctx.supabase
        .from("orders")
        .select(KDS_COMPLETION_ORDER_SELECT)
        .eq("branch_id", parsed.data.branchId)
        .in("id", ids);
      return { data: data ?? null, error };
    },
  );

  if (ordersResult.error) {
    return {
      success: false,
      error: KDS_VI.completionHistoryDetailLoadFailed,
    };
  }

  return {
    success: true,
    data: {
      entries: buildKdsOperationalHistory({
        events,
        orders: normalizeCompletionOrders(ordersResult.data),
        limit: parsed.data.limit,
      }),
      truncated,
    },
  };
}
