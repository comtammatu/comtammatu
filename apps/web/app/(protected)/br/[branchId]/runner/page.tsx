import type { ReactNode } from "react";
import { CircleAlert as IconAlertCircle } from "lucide-react";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
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
} from "../kds/lib/query-helpers";
import { RunnerIdleVisual, type RunnerIdleState } from "./runner-idle-visual";
import { RunnerRealtimeRefresh } from "./runner-realtime-refresh";
import { RunnerWaitTime } from "./runner-wait-time";

const RUNNER_ERROR_MESSAGE =
  "Không tải được màn gọi số. Vui lòng tải lại trang.";
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
// 4 rows on small boards, 6 on xl TVs. The server cannot know the
// breakpoint, so it renders up to the xl limit and rows 5-6 collapse
// below xl via `hidden xl:grid`; the overflow footer mirrors the same
// split with responsive visibility.
const RUNNER_ROW_LIMIT_BASE = 4;
const RUNNER_ROW_LIMIT_XL = 6;
const RUNNER_COLUMN_SPAN = {
  order: 4,
  quantity: 3,
  status: 4,
  wait: 1,
} as const;
const RUNNER_COPY = {
  eyebrow: MODULE_LABELS_VI.runner,
  pending: "Đang chờ",
  idleEmptyTitle: "Đang chờ món mới.",
  idleDoneTitle: "Các món đã được phục vụ đầy đủ.",
  idleBrandLine: "Thịt tươi 100% - chúc quý khách dùng bữa ngon miệng.",
  itemUnit: "món",
  moreOrders: (count: number) => `Còn ${String(count)} đơn đang chờ`,
  footer: {
    wifi: "WiFi: Má Tư",
    password: "Mật khẩu: xincamon",
  },
  tableHeaders: {
    order: "Đơn",
    quantity: "Số món",
    status: "Trạng thái",
    wait: "Chờ",
  },
} as const;

type RunnerTicketSnapshot = BuildRunnerQueueInput["tickets"][number] & {
  order_item_id: number;
};

type RunnerOrderItemQuantityRow = RunnerOrderItemRow & {
  quantity: number | string | null;
};

type RunnerListStatus = "pending";
type RunnerColumnSpan =
  (typeof RUNNER_COLUMN_SPAN)[keyof typeof RUNNER_COLUMN_SPAN];

type RunnerListRow = {
  key: string;
  item: RunnerQueueItem;
  orderLabel: string;
  itemQuantity: number;
  status: RunnerListStatus;
};

type RunnerSupabase = ReturnType<typeof createServiceClient>;

type RunnerQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

async function fetchRunnerTodayTicketCount(args: {
  supabase: RunnerSupabase;
  branchId: number;
  todayStartIso: string;
  todayEndIso: string;
}): Promise<{ count: number; error: boolean }> {
  const { supabase, branchId, todayStartIso, todayEndIso } = args;
  const { count, error } = await supabase
    .from("kds_tickets")
    .select("id", { count: "exact", head: true })
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

function isRunnerOperationalBranchKind(branchKind: string): boolean {
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
  branchId: number;
  orderIds: number[];
}): Promise<{ data: BuildRunnerQueueInput["orders"] | null; error: unknown }> {
  const { supabase, branchId, orderIds } = args;
  const result = await fetchChunkedRows<unknown>(orderIds, async (ids) => {
    let ordersRes: RunnerQueryResult = await supabase
      .from("orders")
      .select(RUNNER_ORDER_SELECT_WITH_PRIORITY)
      .eq("branch_id", branchId)
      .in("id", ids);

    if (isMissingPriorityColumn(ordersRes.error)) {
      ordersRes = await supabase
        .from("orders")
        .select(RUNNER_ORDER_SELECT_BASE)
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
  orderItemIds: number[];
}): Promise<{ data: RunnerOrderItemQuantityRow[] | null; error: unknown }> {
  const { supabase, orderItemIds } = args;
  const result = await fetchChunkedRows<unknown>(orderItemIds, async (ids) => {
    let itemsRes: RunnerQueryResult = await supabase
      .from("order_items")
      .select(RUNNER_ORDER_ITEM_SELECT_WITH_PRIORITY)
      .in("id", ids);

    if (isMissingPriorityColumn(itemsRes.error)) {
      itemsRes = await supabase
        .from("order_items")
        .select(RUNNER_ORDER_ITEM_SELECT_BASE)
        .in("id", ids);
    }

    return itemsRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizeRunnerOrderItems(result.data), error: null };
}

async function fetchRunnerKitchenBatchesByIds(args: {
  supabase: RunnerSupabase;
  batchIds: number[];
}): Promise<{
  data: BuildRunnerQueueInput["kitchenBatches"] | null;
  error: unknown;
}> {
  const { supabase, batchIds } = args;
  return fetchChunkedRows<BuildRunnerQueueInput["kitchenBatches"][number]>(
    batchIds,
    async (ids) => {
      const { data, error } = await supabase
        .from("kitchen_send_batches")
        .select(
          "id, order_id, kitchen_ticket_number, send_seq, kind, created_at",
        )
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
  branchId: number;
  todayStartIso: string;
}): Promise<{ tickets: RunnerTicketSnapshot[]; error: boolean }> {
  const { supabase, branchId, todayStartIso } = args;
  const activeTicketsResult = await fetchPagedRows<RunnerTicketSnapshot>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("kds_tickets")
        .select(RUNNER_TICKET_SELECT)
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

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("id", branchIdNum)
    .maybeSingle();

  if (
    branchError ||
    !branch ||
    !isRunnerOperationalBranchKind(branch.branch_kind)
  ) {
    return <RunnerErrorState />;
  }

  const ticketResult = await fetchRunnerVisibleTickets({
    supabase,
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
          branchId: branchIdNum,
          orderIds,
        })
      : Promise.resolve({ data: [], error: null }),
    batchIds.length > 0
      ? fetchRunnerKitchenBatchesByIds({ supabase, batchIds })
      : Promise.resolve({ data: [], error: null }),
    orderItemIds.length > 0
      ? fetchRunnerOrderItemsByIds({ supabase, orderItemIds })
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
      <RunnerRealtimeRefresh branchId={branchIdNum} />

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
      <RunnerOrderBoard rows={rows} nowMs={nowMs} idleState={idleState} />
      <RunnerFooter />
    </div>
  );
}

function RunnerOrderBoard({
  rows,
  nowMs,
  idleState,
}: {
  rows: RunnerListRow[];
  nowMs: number;
  idleState: RunnerIdleState | null;
}) {
  if (rows.length === 0) {
    const resolvedIdleState = idleState ?? "empty";

    return (
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden bg-background px-8 text-center">
        <RunnerIdleAtmosphere state={resolvedIdleState} />
        <div className="relative z-10 flex flex-col items-center justify-center gap-6">
          <RunnerIdleVisual state={resolvedIdleState} />
          <div className="flex max-w-full flex-col items-center gap-3">
            <p className="max-w-full font-heading text-runner-board font-semibold text-foreground">
              {resolvedIdleState === "done"
                ? RUNNER_COPY.idleDoneTitle
                : RUNNER_COPY.idleEmptyTitle}
            </p>
            <p className="max-w-full font-heading text-runner-empty-secondary font-semibold text-muted-foreground">
              {RUNNER_COPY.idleBrandLine}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const visibleRows = rows.slice(0, RUNNER_ROW_LIMIT_XL);
  const overflowBase = rows.length - RUNNER_ROW_LIMIT_BASE;
  const overflowXl = rows.length - RUNNER_ROW_LIMIT_XL;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="grid grid-cols-12 divide-x divide-border/70 border-b border-border bg-muted/70">
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.order}>
          {RUNNER_COPY.tableHeaders.order}
        </RunnerColumnHeader>
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.quantity}>
          {RUNNER_COPY.tableHeaders.quantity}
        </RunnerColumnHeader>
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.status}>
          {RUNNER_COPY.tableHeaders.status}
        </RunnerColumnHeader>
        <RunnerColumnHeader span={RUNNER_COLUMN_SPAN.wait} align="right">
          {RUNNER_COPY.tableHeaders.wait}
        </RunnerColumnHeader>
      </div>
      <div
        role="list"
        className="grid min-h-0 flex-1 grid-rows-4 overflow-hidden xl:grid-rows-6"
      >
        {visibleRows.map((row, index) => (
          <RunnerOrderListRow
            key={row.key}
            row={row}
            featured={index === 0}
            hiddenBelowXl={index >= RUNNER_ROW_LIMIT_BASE}
            nowMs={nowMs}
          />
        ))}
      </div>
      {overflowBase > 0 ? (
        <p
          className={cn(
            "shrink-0 border-t border-border bg-muted/70 px-4 py-1.5 text-center font-heading text-runner-footer font-semibold text-muted-foreground",
            overflowXl <= 0 && "xl:hidden",
          )}
        >
          <span className="xl:hidden">
            {RUNNER_COPY.moreOrders(overflowBase)}
          </span>
          {overflowXl > 0 ? (
            <span className="hidden xl:inline">
              {RUNNER_COPY.moreOrders(overflowXl)}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function RunnerIdleAtmosphere({ state }: { state: RunnerIdleState }) {
  const emberRows = Array.from({ length: 12 }, (_, index) => index);
  const heatColumns = Array.from({ length: 5 }, (_, index) => index);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-runner-idle-atmosphere={state}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-background via-warning/5 to-background" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-warning/20 via-warning/10 to-transparent motion-safe:animate-pulse" />
      <div className="absolute inset-x-0 bottom-0 border-t border-warning/20 bg-foreground/5" />
      <div className="absolute inset-x-8 bottom-8 grid grid-cols-12 gap-2 opacity-80">
        {emberRows.map((index) => (
          <span
            key={index}
            className={cn(
              "h-2 rounded-full",
              index % 3 === 0 ? "bg-warning/45" : "bg-foreground/15 shadow-sm",
            )}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-20 flex justify-center gap-6 opacity-60">
        {heatColumns.map((index) => (
          <span
            key={index}
            className={cn(
              "h-28 w-1 rounded-full bg-warning/25 blur-sm motion-safe:animate-pulse",
              index % 2 === 0 ? "mb-6" : "mt-4",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function RunnerFooter() {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border bg-muted/70 px-4 py-2 font-heading text-runner-footer font-semibold text-foreground xl:gap-x-16 xl:px-8 xl:py-4">
      <span>{RUNNER_COPY.footer.wifi}</span>
      <span>{RUNNER_COPY.footer.password}</span>
    </footer>
  );
}

function RunnerColumnHeader({
  children,
  span,
  align = "left",
}: {
  children: ReactNode;
  span: RunnerColumnSpan;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "py-2 font-heading text-runner-header font-semibold text-foreground xl:py-4",
        span === RUNNER_COLUMN_SPAN.wait ? "px-2 xl:px-4" : "px-4 xl:px-8",
        getRunnerColumnSpanClass(span),
        align === "right" && "text-right",
      )}
    >
      {children}
    </div>
  );
}

function RunnerOrderListRow({
  row,
  featured,
  hiddenBelowXl,
  nowMs,
}: {
  row: RunnerListRow;
  featured: boolean;
  hiddenBelowXl: boolean;
  nowMs: number;
}) {
  const statusLabel = getRunnerStatusLabel(row.status);

  return (
    <div
      role="listitem"
      className={cn(
        "grid h-full min-h-0 w-full grid-cols-12 items-stretch gap-0 divide-x divide-border/70 border-b border-l-4",
        getRunnerRowClass(),
        featured && "border-l-primary",
        hiddenBelowXl && "hidden xl:grid",
      )}
    >
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.order} mono>
        {row.orderLabel}
      </RunnerOrderCell>
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.quantity} mono>
        {formatItemQuantity(row.itemQuantity)} {RUNNER_COPY.itemUnit}
      </RunnerOrderCell>
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.status} mono>
        {statusLabel}
      </RunnerOrderCell>
      <RunnerOrderCell span={RUNNER_COLUMN_SPAN.wait} align="right" mono>
        <RunnerWaitTime startIso={row.item.sortAt} initialNowMs={nowMs} />
      </RunnerOrderCell>
    </div>
  );
}

function RunnerOrderCell({
  children,
  span,
  align = "left",
  mono = false,
}: {
  children: ReactNode;
  span: RunnerColumnSpan;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col justify-center py-2 xl:py-4",
        span === RUNNER_COLUMN_SPAN.wait ? "px-2 xl:px-4" : "px-4 xl:px-8",
        getRunnerColumnSpanClass(span),
        align === "right" && "text-right",
      )}
    >
      <div
        className={cn(
          "min-w-0 whitespace-normal break-words font-semibold text-current text-runner-board",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function getRunnerColumnSpanClass(span: RunnerColumnSpan): string {
  if (span === 4) return "col-span-4";
  if (span === 3) return "col-span-3";
  return "col-span-1";
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
    item,
    orderLabel: formatRunnerOrderLabel(item),
    itemQuantity: countItemQuantity({
      item,
      orderItemIdByTicketId,
      quantityByOrderItemId,
    }),
    status: resolveRunnerListStatus(item),
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

function getRunnerStatusLabel(_status: RunnerListStatus): "Đang chờ" {
  return RUNNER_COPY.pending;
}

function getRunnerRowClass(): string {
  return "border-warning/70 bg-warning/5";
}

function normalizeQuantity(value: number | string | null): number {
  const quantity = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return quantity;
}

function formatItemQuantity(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(value);
}

function RunnerErrorState() {
  return (
    <section className="flex h-dvh min-h-0 w-full items-center justify-center overflow-hidden bg-background">
      <Alert variant="destructive" className="max-w-md">
        <IconAlertCircle />
        <AlertDescription>{RUNNER_ERROR_MESSAGE}</AlertDescription>
      </Alert>
    </section>
  );
}
