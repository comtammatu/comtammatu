import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { CircleAlert as IconAlertCircle } from "lucide-react";
import { AppEmptyState } from "@/components/surface";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  buildRunnerQueue,
  formatRunnerOrderLabel,
  type BuildRunnerQueueInput,
  type RunnerOrderItemRow,
  type RunnerQueueItem,
} from "@comtammatu/shared/runner";
import { MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import {
  dedupeRowsById,
  fetchChunkedRows,
  fetchPagedRows,
  uniqueNumbers,
} from "../kds/_lib/query-helpers";
import {
  RunnerOrderBoardClient,
  type RunnerBoardRow,
} from "./runner-order-board-client";
import type { RunnerIdleState } from "./runner-idle-visual";
import { RunnerRealtimeRefresh } from "./runner-realtime-refresh";

const RUNNER_ERROR_MESSAGE =
  "Không tải được màn gọi số. Vui lòng tải lại trang.";
const RUNNER_ERROR_TITLE = "Màn gọi số chưa sẵn sàng";
const RUNNER_ERROR_BADGE = "Cần tải lại";
const RUNNER_TICKET_SELECT =
  "id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at";
const RUNNER_ORDER_SELECT_WITH_PRIORITY =
  "id, order_number, order_type, table_id, status, created_at, is_priority, tables(number)";
const RUNNER_ORDER_SELECT_BASE =
  "id, order_number, order_type, table_id, status, created_at, tables(number)";
const RUNNER_ORDER_ITEM_SELECT_WITH_PRIORITY =
  "id, order_id, quantity, is_priority";
const RUNNER_ORDER_ITEM_SELECT_BASE = "id, order_id, quantity";
const RUNNER_ACTIVE_STATUSES = ["pending", "preparing"] as const;
const RUNNER_COPY = {
  eyebrow: MODULE_LABELS_VI.runner,
  footer: {
    wifi: "WiFi: Má Tư",
    password: "Mật khẩu: xincamon",
  },
} as const;

type RunnerTicketSnapshot = BuildRunnerQueueInput["tickets"][number] & {
  order_item_id: number;
};

type RunnerOrderItemQuantityRow = RunnerOrderItemRow & {
  quantity: number | string | null;
};

type RunnerListStatus = RunnerBoardRow["status"];
type RunnerListRow = RunnerBoardRow;

type RunnerSupabase = ReturnType<typeof createServiceClient>;

type RunnerQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

type RunnerBranchRow = {
  id: number;
  tenant_id: number;
  name: string;
  branch_kind: string;
  is_active: boolean;
};

/**
 * Branch identity (name/kind/active flag) rarely changes but this kiosk
 * screen polls via `RunnerRealtimeRefresh` (15s `router.refresh()`), so an
 * uncached lookup re-queries `branches` every poll for hours per shift.
 * Tag `"branches-list"` busts via the same tag `branches/actions.ts`
 * mutations already call. 5-minute TTL is a safety net for any mutation
 * path that forgets to call the tag.
 */
const getCachedRunnerBranch = unstable_cache(
  async (branchId: number): Promise<RunnerBranchRow | null> => {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("branches")
      .select("id, tenant_id, name, branch_kind, is_active")
      .eq("id", branchId)
      .maybeSingle();

    if (error) return null;
    return data as RunnerBranchRow | null;
  },
  ["runner-branch"],
  {
    revalidate: 300,
    tags: ["branches-list"],
  },
);

async function fetchRunnerTodayTicketCount(args: {
  supabase: RunnerSupabase;
  tenantId: number;
  branchId: number;
  todayStartIso: string;
  todayEndIso: string;
}): Promise<{ count: number; error: boolean }> {
  const { supabase, tenantId, branchId, todayStartIso, todayEndIso } = args;
  const { count, error } = await supabase
    .from("kds_tickets")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .gte("created_at", todayStartIso)
    .lt("created_at", todayEndIso);

  if (error) {
    return { count: 0, error: true };
  }

  return { count: count ?? 0, error: false };
}

function isMissingPriorityColumn(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("is_priority") && message.includes("column");
}

function isRunnerOperationalBranchKind(branchKind: string | null): boolean {
  return branchKind === "branch";
}

function normalizeRunnerOrders(
  rows: unknown[] | null | undefined,
): BuildRunnerQueueInput["orders"] {
  return (
    (rows ?? []) as Array<
      Omit<BuildRunnerQueueInput["orders"][number], "is_priority"> & {
        is_priority?: boolean | null;
      }
    >
  ).map((row) => ({
    ...row,
    is_priority: row.is_priority === true,
  }));
}

function normalizeRunnerOrderItems(
  rows: unknown[] | null | undefined,
): RunnerOrderItemQuantityRow[] {
  return (
    (rows ?? []) as Array<
      Omit<RunnerOrderItemQuantityRow, "is_priority"> & {
        is_priority?: boolean | null;
      }
    >
  ).map((row) => ({
    ...row,
    is_priority: row.is_priority === true,
  }));
}

function sortRunnerTicketsNewestFirst(
  tickets: readonly RunnerTicketSnapshot[],
): RunnerTicketSnapshot[] {
  return [...tickets].sort((a, b) => {
    const timeDelta =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (timeDelta !== 0) return timeDelta;
    return b.id - a.id;
  });
}

async function fetchRunnerOrdersByIds(args: {
  supabase: RunnerSupabase;
  tenantId: number;
  branchId: number;
  orderIds: number[];
}): Promise<{ data: BuildRunnerQueueInput["orders"] | null; error: unknown }> {
  const { supabase, tenantId, branchId, orderIds } = args;
  const result = await fetchChunkedRows<unknown>(orderIds, async (ids) => {
    let ordersRes: RunnerQueryResult = await supabase
      .from("orders")
      .select(RUNNER_ORDER_SELECT_WITH_PRIORITY)
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .in("id", ids);

    if (isMissingPriorityColumn(ordersRes.error)) {
      ordersRes = await supabase
        .from("orders")
        .select(RUNNER_ORDER_SELECT_BASE)
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .in("id", ids);
    }

    return ordersRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizeRunnerOrders(result.data), error: null };
}

async function fetchRunnerOrderItemsByIds(args: {
  supabase: RunnerSupabase;
  tenantId: number;
  orderItemIds: number[];
}): Promise<{ data: RunnerOrderItemQuantityRow[] | null; error: unknown }> {
  const { supabase, tenantId, orderItemIds } = args;
  const result = await fetchChunkedRows<unknown>(orderItemIds, async (ids) => {
    let itemsRes: RunnerQueryResult = await supabase
      .from("order_items")
      .select(RUNNER_ORDER_ITEM_SELECT_WITH_PRIORITY)
      .eq("tenant_id", tenantId)
      .in("id", ids);

    if (isMissingPriorityColumn(itemsRes.error)) {
      itemsRes = await supabase
        .from("order_items")
        .select(RUNNER_ORDER_ITEM_SELECT_BASE)
        .eq("tenant_id", tenantId)
        .in("id", ids);
    }

    return itemsRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizeRunnerOrderItems(result.data), error: null };
}

async function fetchRunnerKitchenBatchesByIds(args: {
  supabase: RunnerSupabase;
  tenantId: number;
  branchId: number;
  batchIds: number[];
}): Promise<{
  data: BuildRunnerQueueInput["kitchenBatches"] | null;
  error: unknown;
}> {
  const { supabase, tenantId, branchId, batchIds } = args;
  return fetchChunkedRows<BuildRunnerQueueInput["kitchenBatches"][number]>(
    batchIds,
    async (ids) => {
      const { data, error } = await supabase
        .from("kitchen_send_batches")
        .select(
          "id, order_id, kitchen_ticket_number, send_seq, kind, created_at",
        )
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .in("id", ids);

      return {
        data: (data ?? null) as BuildRunnerQueueInput["kitchenBatches"] | null,
        error,
      };
    },
  );
}

async function fetchRunnerVisibleTickets(args: {
  supabase: RunnerSupabase;
  tenantId: number;
  branchId: number;
  todayStartIso: string;
}): Promise<{ tickets: RunnerTicketSnapshot[]; error: boolean }> {
  const { supabase, tenantId, branchId, todayStartIso } = args;
  const activeTicketsResult = await fetchPagedRows<RunnerTicketSnapshot>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("kds_tickets")
        .select(RUNNER_TICKET_SELECT)
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .in("status", RUNNER_ACTIVE_STATUSES)
        .gte("created_at", todayStartIso)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      return { data: (data ?? null) as RunnerTicketSnapshot[] | null, error };
    },
  );

  if (activeTicketsResult.error) {
    return { tickets: [], error: true };
  }

  const activeTickets = activeTicketsResult.data ?? [];
  const activeBatchIds = uniqueNumbers(
    activeTickets
      .map((ticket) => ticket.kitchen_send_batch_id)
      .filter((id): id is number => id !== null),
  );
  const activeUngroupedOrderIds = uniqueNumbers(
    activeTickets
      .filter((ticket) => ticket.kitchen_send_batch_id === null)
      .map((ticket) => ticket.order_id),
  );
  const chunks: RunnerTicketSnapshot[][] = [];

  if (activeBatchIds.length > 0) {
    const batchTicketsResult = await fetchChunkedRows<RunnerTicketSnapshot>(
      activeBatchIds,
      (batchIds) =>
        fetchPagedRows<RunnerTicketSnapshot>(async (from, to) => {
          const { data, error } = await supabase
            .from("kds_tickets")
            .select(RUNNER_TICKET_SELECT)
            .eq("tenant_id", tenantId)
            .eq("branch_id", branchId)
            .in("status", RUNNER_ACTIVE_STATUSES)
            .gte("created_at", todayStartIso)
            .in("kitchen_send_batch_id", batchIds)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to);

          return {
            data: (data ?? null) as RunnerTicketSnapshot[] | null,
            error,
          };
        }),
    );

    if (batchTicketsResult.error) return { tickets: [], error: true };
    chunks.push(batchTicketsResult.data ?? []);
  }

  if (activeUngroupedOrderIds.length > 0) {
    const ungroupedTicketsResult = await fetchChunkedRows<RunnerTicketSnapshot>(
      activeUngroupedOrderIds,
      (orderIds) =>
        fetchPagedRows<RunnerTicketSnapshot>(async (from, to) => {
          const { data, error } = await supabase
            .from("kds_tickets")
            .select(RUNNER_TICKET_SELECT)
            .eq("tenant_id", tenantId)
            .eq("branch_id", branchId)
            .in("status", RUNNER_ACTIVE_STATUSES)
            .gte("created_at", todayStartIso)
            .is("kitchen_send_batch_id", null)
            .in("order_id", orderIds)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to);

          return {
            data: (data ?? null) as RunnerTicketSnapshot[] | null,
            error,
          };
        }),
    );

    if (ungroupedTicketsResult.error) return { tickets: [], error: true };
    chunks.push(ungroupedTicketsResult.data ?? []);
  }

  return {
    tickets: sortRunnerTicketsNewestFirst(dedupeRowsById(chunks.flat())),
    error: false,
  };
}

export default async function RunnerPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const branchIdNum = Number(branchId);
  if (!Number.isInteger(branchIdNum) || branchIdNum <= 0) {
    return <RunnerErrorState />;
  }

  const supabase = createServiceClient();
  const { startIso: todayStartIso, endIso: todayEndIso } =
    getVNDayUtcRange(getVNDateString());

  const branch = await getCachedRunnerBranch(branchIdNum);

  if (
    !branch ||
    !isRunnerOperationalBranchKind(branch.branch_kind) ||
    branch.is_active !== true
  ) {
    notFound();
  }

  const tenantId = branch.tenant_id;

  const ticketResult = await fetchRunnerVisibleTickets({
    supabase,
    tenantId,
    branchId: branchIdNum,
    todayStartIso,
  });

  if (ticketResult.error) {
    return <RunnerErrorState />;
  }

  const tickets = ticketResult.tickets;
  const orderIds = uniqueNumbers(tickets.map((ticket) => ticket.order_id));
  const orderItemIds = uniqueNumbers(
    tickets.map((ticket) => ticket.order_item_id),
  );
  const batchIds = uniqueNumbers(
    tickets
      .map((ticket) => ticket.kitchen_send_batch_id)
      .filter((id): id is number => id !== null),
  );

  const [ordersRes, batchesRes, orderItemsRes] = await Promise.all([
    orderIds.length > 0
      ? fetchRunnerOrdersByIds({
          supabase,
          tenantId,
          branchId: branchIdNum,
          orderIds,
        })
      : Promise.resolve({ data: [], error: null }),
    batchIds.length > 0
      ? fetchRunnerKitchenBatchesByIds({
          supabase,
          tenantId,
          branchId: branchIdNum,
          batchIds,
        })
      : Promise.resolve({ data: [], error: null }),
    orderItemIds.length > 0
      ? fetchRunnerOrderItemsByIds({ supabase, tenantId, orderItemIds })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (ordersRes.error || batchesRes.error || orderItemsRes.error) {
    return <RunnerErrorState />;
  }

  const orderItems = (orderItemsRes.data ?? []) as RunnerOrderItemQuantityRow[];
  const queue = buildRunnerQueue({
    tickets,
    orders: (ordersRes.data ?? []) as BuildRunnerQueueInput["orders"],
    kitchenBatches: (batchesRes.data ??
      []) as BuildRunnerQueueInput["kitchenBatches"],
    orderItems,
  });

  const quantityByOrderItemId = new Map(
    orderItems.map((row) => [row.id, normalizeQuantity(row.quantity)]),
  );
  const orderItemIdByTicketId = new Map(
    tickets.map((ticket) => [ticket.id, ticket.order_item_id]),
  );
  const rows = queue.map((item) =>
    toRunnerListRow({
      item,
      orderItemIdByTicketId,
      quantityByOrderItemId,
    }),
  );
  let idleState: RunnerIdleState | null = null;

  if (rows.length === 0) {
    const todayTicketCountResult = await fetchRunnerTodayTicketCount({
      supabase,
      tenantId,
      branchId: branchIdNum,
      todayStartIso,
      todayEndIso,
    });

    if (todayTicketCountResult.error) {
      return <RunnerErrorState />;
    }

    idleState = todayTicketCountResult.count > 0 ? "done" : "empty";
  }

  const nowMs = Date.now();

  return (
    <>
      <RunnerRealtimeRefresh />

      <section
        aria-label={`${RUNNER_COPY.eyebrow} ${branch.name}`}
        className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background"
      >
        <RunnerOrderScreen rows={rows} nowMs={nowMs} idleState={idleState} />
      </section>
    </>
  );
}

function RunnerOrderScreen({
  rows,
  nowMs,
  idleState,
}: {
  rows: RunnerListRow[];
  nowMs: number;
  idleState: RunnerIdleState | null;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <RunnerOrderBoardClient rows={rows} nowMs={nowMs} idleState={idleState} />
      <RunnerFooter />
    </div>
  );
}

function RunnerFooter() {
  return (
    <footer className="shrink-0">
      <div
        aria-hidden="true"
        className="brand-strip brand-pattern-hat-gao w-full"
      />
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border bg-muted/70 px-4 py-2 font-heading text-runner-footer font-semibold text-foreground xl:gap-x-16 xl:px-8 xl:py-4">
        <span>{RUNNER_COPY.footer.wifi}</span>
        <span>{RUNNER_COPY.footer.password}</span>
      </div>
    </footer>
  );
}

function toRunnerListRow({
  item,
  orderItemIdByTicketId,
  quantityByOrderItemId,
}: {
  item: RunnerQueueItem;
  orderItemIdByTicketId: Map<number, number>;
  quantityByOrderItemId: Map<number, number>;
}): RunnerListRow {
  return {
    key: item.id,
    orderLabel: formatRunnerOrderLabel(item),
    itemQuantity: countItemQuantity({
      item,
      orderItemIdByTicketId,
      quantityByOrderItemId,
    }),
    status: resolveRunnerListStatus(item),
    sortAt: item.sortAt,
  };
}

function countItemQuantity({
  item,
  orderItemIdByTicketId,
  quantityByOrderItemId,
}: {
  item: RunnerQueueItem;
  orderItemIdByTicketId: Map<number, number>;
  quantityByOrderItemId: Map<number, number>;
}): number {
  const seenOrderItemIds = new Set<number>();
  let total = 0;

  for (const ticketId of item.ticketIds) {
    const orderItemId = orderItemIdByTicketId.get(ticketId);
    if (orderItemId === undefined || seenOrderItemIds.has(orderItemId)) {
      continue;
    }

    seenOrderItemIds.add(orderItemId);
    total += quantityByOrderItemId.get(orderItemId) ?? 0;
  }

  return total > 0 ? total : item.ticketCount;
}

function resolveRunnerListStatus(_item: RunnerQueueItem): RunnerListStatus {
  return "pending";
}

function normalizeQuantity(value: number | string | null): number {
  const quantity = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return quantity;
}

function RunnerErrorState() {
  return (
    <section className="flex h-dvh min-h-0 w-full items-center justify-center overflow-hidden bg-background">
      <AppEmptyState
        mode="error"
        description={RUNNER_ERROR_MESSAGE}
        descriptionClassName="max-w-md text-sm"
        icon={<IconAlertCircle />}
        iconClassName="size-12 border border-border/70 bg-background/80 text-destructive"
        title={RUNNER_ERROR_TITLE}
        titleClassName="text-xl font-semibold tracking-tight sm:text-2xl"
      >
        <Badge variant="destructive">
          <IconAlertCircle className="size-3.5" />
          <span>{RUNNER_ERROR_BADGE}</span>
        </Badge>
      </AppEmptyState>
    </section>
  );
}
