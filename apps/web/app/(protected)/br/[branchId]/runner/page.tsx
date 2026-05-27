import type { ReactNode } from "react";
import { CircleAlert as IconAlertCircle } from "lucide-react";
import Image from "next/image";
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
import { loadAuthState } from "@/_lib/auth";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import {
  dedupeRowsById,
  fetchChunkedRows,
  fetchPagedRows,
  uniqueNumbers,
} from "../kds/lib/query-helpers";
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
const RUNNER_VISIBLE_STATUSES = ["pending", "preparing", "ready"] as const;
const RUNNER_VISIBLE_ROW_LIMIT = 4;
const RUNNER_FEATURED_STATUS = "preparing";
const RUNNER_COLUMN_SPAN = {
  order: 5,
  quantity: 2,
  status: 3,
  wait: 2,
} as const;
const RUNNER_MASCOT = {
  src: "/brand/mascot/be-suon-tuoi-runner.png",
  width: 384,
  height: 512,
  alt: "",
} as const;
const RUNNER_COPY = {
  eyebrow: MODULE_LABELS_VI.runner,
  pending: "Chờ",
  preparing: "Chuẩn bị",
  ready: "Sẵn sàng",
  emptyServed: "Các món đã được phục vụ đầy đủ.",
  emptyEnjoy: "Chúc quý khách dùng bữa ngon miệng.",
  itemUnit: "món",
  footer: {
    wifi: "WiFi: Má Tư",
    password: "Mật khẩu: xincamon",
  },
  tableHeaders: {
    order: "Đơn",
    quantity: "Số món",
    status: "Trạng thái",
    wait: "Thời gian đợi",
  },
} as const;

type RunnerTicketSnapshot = BuildRunnerQueueInput["tickets"][number] & {
  order_item_id: number;
};

type RunnerOrderItemQuantityRow = RunnerOrderItemRow & {
  quantity: number | string | null;
};

type RunnerListStatus = "pending" | "preparing" | "ready";
type RunnerColumnSpan =
  (typeof RUNNER_COLUMN_SPAN)[keyof typeof RUNNER_COLUMN_SPAN];

type RunnerListRow = {
  key: string;
  item: RunnerQueueItem;
  orderLabel: string;
  itemQuantity: number;
  status: RunnerListStatus;
};

type RunnerSupabase = Awaited<ReturnType<typeof loadAuthState>>["supabase"];

type RunnerQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

function isMissingPriorityColumn(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("is_priority") && message.includes("column");
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
            .in("status", RUNNER_VISIBLE_STATUSES)
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
            .in("status", RUNNER_VISIBLE_STATUSES)
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
  const { supabase, claims } = await loadAuthState();
  const { startIso: todayStartIso } = getVNDayUtcRange(getVNDateString());

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("id", branchIdNum)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (branchError || !branch) {
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
  const nowMs = Date.now();

  return (
    <>
      <RunnerRealtimeRefresh branchId={branchIdNum} />

      <section
        aria-label={`${RUNNER_COPY.eyebrow} ${branch.name}`}
        className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background"
      >
        <RunnerOrderScreen rows={rows} nowMs={nowMs} />
      </section>
    </>
  );
}

function RunnerOrderScreen({
  rows,
  nowMs,
}: {
  rows: RunnerListRow[];
  nowMs: number;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <RunnerOrderBoard rows={rows} nowMs={nowMs} />
      <RunnerFooter />
    </div>
  );
}

function RunnerOrderBoard({
  rows,
  nowMs,
}: {
  rows: RunnerListRow[];
  nowMs: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden bg-background px-8 text-center">
        <RunnerEmptyMascot />
        <div className="flex max-w-full flex-col items-center gap-3">
          <p className="max-w-full font-heading text-runner-board font-semibold text-foreground">
            {RUNNER_COPY.emptyServed}
          </p>
          <p className="max-w-full font-heading text-runner-empty-secondary font-semibold text-muted-foreground">
            {RUNNER_COPY.emptyEnjoy}
          </p>
        </div>
      </div>
    );
  }

  const visibleRows = rows.slice(0, RUNNER_VISIBLE_ROW_LIMIT);

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
        className="grid min-h-0 flex-1 grid-rows-4 overflow-hidden"
      >
        {visibleRows.map((row, index) => (
          <RunnerOrderListRow
            key={row.key}
            row={row}
            featured={index === 0}
            nowMs={nowMs}
          />
        ))}
      </div>
    </div>
  );
}

function RunnerEmptyMascot() {
  return (
    <Image
      src={RUNNER_MASCOT.src}
      width={RUNNER_MASCOT.width}
      height={RUNNER_MASCOT.height}
      alt={RUNNER_MASCOT.alt}
      aria-hidden="true"
      priority
      className="h-56 w-auto shrink-0 object-contain drop-shadow-lg md:h-64"
    />
  );
}

function RunnerFooter() {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-16 gap-y-2 border-t border-border bg-muted/70 px-8 py-4 font-heading text-runner-footer font-semibold text-foreground">
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
        "px-8 py-4 font-heading text-runner-header font-semibold text-foreground",
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
  nowMs,
}: {
  row: RunnerListRow;
  featured: boolean;
  nowMs: number;
}) {
  const statusLabel = getRunnerStatusLabel(
    featured ? RUNNER_FEATURED_STATUS : row.status,
    { featured },
  );

  return (
    <div
      role="listitem"
      className={cn(
        "grid h-full min-h-0 w-full grid-cols-12 items-stretch gap-0 divide-x divide-border/70 border-b border-l-4",
        featured
          ? "border-primary bg-primary text-primary-foreground"
          : getRunnerRowClass(row.status),
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
        "flex h-full min-w-0 flex-col justify-center px-8 py-4",
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
  if (span === 5) return "col-span-5";
  if (span === 3) return "col-span-3";
  return "col-span-2";
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

function resolveRunnerListStatus(item: RunnerQueueItem): RunnerListStatus {
  if (
    item.status === "pending" ||
    item.status === "preparing" ||
    item.status === "ready"
  ) {
    return item.status;
  }

  return "ready";
}

function getRunnerStatusLabel(
  status: RunnerListStatus,
  options?: { featured?: boolean },
): "Chờ" | "Chuẩn bị" | "Sẵn sàng" {
  if (options?.featured === true) {
    return RUNNER_COPY.preparing;
  }

  if (status === "preparing") {
    return RUNNER_COPY.preparing;
  }

  if (status === "pending") {
    return RUNNER_COPY.pending;
  }

  return RUNNER_COPY.ready;
}

function getRunnerRowClass(status: RunnerListStatus): string {
  if (status === "ready") {
    return "border-success/70 bg-success/5";
  }

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
