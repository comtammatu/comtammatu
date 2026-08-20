import { notFound } from "next/navigation";
import { connection } from "next/server";
import { unstable_cache } from "next/cache";
import { CircleAlert as IconAlertCircle } from "lucide-react";
import { AppEmptyState } from "@/components/surface";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  buildPickupQueue,
  formatPickupOrderLabel,
  isPickupGuestBoardVisible,
  type BuildPickupQueueInput,
  type PickupOrderItemRow,
  type PickupQueueItem,
} from "@comtammatu/shared/pickup";
import { MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { getVNDateString, getVNDayUtcRange } from "@/_lib/format-datetime";
import {
  fetchChunkedRows,
  fetchPagedRows,
  uniqueNumbers,
} from "../kds/_lib/query-helpers";
import {
  PickupOrderBoardClient,
  type PickupBoardRow,
} from "./pickup-order-board-client";
import type { PickupIdleState } from "./pickup-idle-visual";
import { PickupRealtimeRefresh } from "./pickup-realtime-refresh";
import { requestNowMs } from "@/_lib/request-now";

const PICKUP_ERROR_MESSAGE =
  "Không tải được màn gọi số. Vui lòng tải lại trang.";
const PICKUP_ERROR_TITLE = "Màn gọi số chưa sẵn sàng";
const PICKUP_ERROR_BADGE = "Cần tải lại";
const PICKUP_TICKET_SELECT =
  "id, order_id, order_item_id, kitchen_send_batch_id, status, bumped_at, created_at, updated_at";
const PICKUP_ORDER_SELECT_WITH_PRIORITY =
  "id, order_number, order_type, table_id, status, created_at, is_priority, delivery_platform, external_order_ref, tables(number)";
const PICKUP_ORDER_SELECT_BASE =
  "id, order_number, order_type, table_id, status, created_at, delivery_platform, external_order_ref, tables(number)";
const PICKUP_ORDER_ITEM_SELECT_WITH_PRIORITY =
  "id, order_id, quantity, is_priority";
const PICKUP_ORDER_ITEM_SELECT_BASE = "id, order_id, quantity";
const PICKUP_ACTIVE_STATUSES = ["pending", "preparing", "ready"] as const;
const PICKUP_COPY = {
  eyebrow: MODULE_LABELS_VI.pickup,
  footer: {
    wifi: "WiFi: Má Tư",
    password: "Mật khẩu: xincamon",
  },
} as const;

type PickupTicketSnapshot = BuildPickupQueueInput["tickets"][number] & {
  order_item_id: number;
};

type PickupOrderItemQuantityRow = PickupOrderItemRow & {
  quantity: number | string | null;
};

type PickupListStatus = PickupBoardRow["status"];
type PickupListRow = PickupBoardRow;

type PickupSupabase = ReturnType<typeof createServiceClient>;

type PickupQueryResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};

type PickupBranchRow = {
  id: number;
  tenant_id: number;
  name: string;
  branch_kind: string;
  is_active: boolean;
};

/**
 * Branch identity (name/kind/active flag) rarely changes but this kiosk
 * screen polls via `PickupRealtimeRefresh` (3s `router.refresh()`), so an
 * uncached lookup re-queries `branches` every poll for hours per shift.
 * Tag `"branches-list"` busts via the same tag `branches/actions.ts`
 * mutations already call. 5-minute TTL is a safety net for any mutation
 * path that forgets to call the tag.
 */
const getCachedPickupBranch = unstable_cache(
  async (branchId: number): Promise<PickupBranchRow | null> => {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("branches")
      .select("id, tenant_id, name, branch_kind, is_active")
      .eq("id", branchId)
      .maybeSingle();

    if (error) return null;
    return data as PickupBranchRow | null;
  },
  ["pickup-branch"],
  {
    revalidate: 300,
    tags: ["branches-list"],
  },
);

async function fetchPickupTodayTicketCount(args: {
  supabase: PickupSupabase;
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

function isPickupOperationalBranchKind(branchKind: string | null): boolean {
  return branchKind === "branch";
}

function normalizePickupOrders(
  rows: unknown[] | null | undefined,
): BuildPickupQueueInput["orders"] {
  return (
    (rows ?? []) as Array<
      Omit<BuildPickupQueueInput["orders"][number], "is_priority"> & {
        is_priority?: boolean | null;
        delivery_platform?: string | null;
        external_order_ref?: string | null;
      }
    >
  ).map((row) => ({
    ...row,
    is_priority: row.is_priority === true,
    delivery_platform: row.delivery_platform ?? null,
    external_order_ref: row.external_order_ref ?? null,
  }));
}

function normalizePickupOrderItems(
  rows: unknown[] | null | undefined,
): PickupOrderItemQuantityRow[] {
  return (
    (rows ?? []) as Array<
      Omit<PickupOrderItemQuantityRow, "is_priority"> & {
        is_priority?: boolean | null;
      }
    >
  ).map((row) => ({
    ...row,
    is_priority: row.is_priority === true,
  }));
}

function sortPickupTicketsNewestFirst(
  tickets: readonly PickupTicketSnapshot[],
): PickupTicketSnapshot[] {
  return [...tickets].sort((a, b) => {
    const timeDelta =
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (timeDelta !== 0) return timeDelta;
    return b.id - a.id;
  });
}

async function fetchPickupOrdersByIds(args: {
  supabase: PickupSupabase;
  tenantId: number;
  branchId: number;
  orderIds: number[];
}): Promise<{ data: BuildPickupQueueInput["orders"] | null; error: unknown }> {
  const { supabase, tenantId, branchId, orderIds } = args;
  const result = await fetchChunkedRows<unknown>(orderIds, async (ids) => {
    let ordersRes: PickupQueryResult = await supabase
      .from("orders")
      .select(PICKUP_ORDER_SELECT_WITH_PRIORITY)
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId)
      .in("id", ids);

    if (isMissingPriorityColumn(ordersRes.error)) {
      ordersRes = await supabase
        .from("orders")
        .select(PICKUP_ORDER_SELECT_BASE)
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .in("id", ids);
    }

    return ordersRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizePickupOrders(result.data), error: null };
}

async function fetchPickupOrderItemsByIds(args: {
  supabase: PickupSupabase;
  tenantId: number;
  orderItemIds: number[];
}): Promise<{ data: PickupOrderItemQuantityRow[] | null; error: unknown }> {
  const { supabase, tenantId, orderItemIds } = args;
  const result = await fetchChunkedRows<unknown>(orderItemIds, async (ids) => {
    let itemsRes: PickupQueryResult = await supabase
      .from("order_items")
      .select(PICKUP_ORDER_ITEM_SELECT_WITH_PRIORITY)
      .eq("tenant_id", tenantId)
      .in("id", ids);

    if (isMissingPriorityColumn(itemsRes.error)) {
      itemsRes = await supabase
        .from("order_items")
        .select(PICKUP_ORDER_ITEM_SELECT_BASE)
        .eq("tenant_id", tenantId)
        .in("id", ids);
    }

    return itemsRes;
  });

  if (result.error) return { data: null, error: result.error };
  return { data: normalizePickupOrderItems(result.data), error: null };
}

async function fetchPickupKitchenBatchesByIds(args: {
  supabase: PickupSupabase;
  tenantId: number;
  branchId: number;
  batchIds: number[];
}): Promise<{
  data: BuildPickupQueueInput["kitchenBatches"] | null;
  error: unknown;
}> {
  const { supabase, tenantId, branchId, batchIds } = args;
  return fetchChunkedRows<BuildPickupQueueInput["kitchenBatches"][number]>(
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
        data: (data ?? null) as BuildPickupQueueInput["kitchenBatches"] | null,
        error,
      };
    },
  );
}

async function fetchPickupVisibleTickets(args: {
  supabase: PickupSupabase;
  tenantId: number;
  branchId: number;
  todayStartIso: string;
}): Promise<{ tickets: PickupTicketSnapshot[]; error: boolean }> {
  const { supabase, tenantId, branchId, todayStartIso } = args;
  const activeTicketsResult = await fetchPagedRows<PickupTicketSnapshot>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("kds_tickets")
        .select(PICKUP_TICKET_SELECT)
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .in("status", PICKUP_ACTIVE_STATUSES)
        .gte("created_at", todayStartIso)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      return { data: (data ?? null) as PickupTicketSnapshot[] | null, error };
    },
  );

  if (activeTicketsResult.error) {
    return { tickets: [], error: true };
  }

  return {
    tickets: sortPickupTicketsNewestFirst(activeTicketsResult.data ?? []),
    error: false,
  };
}

export default async function PickupPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  await connection();
  const { branchId } = await params;
  const branchIdNum = Number(branchId);
  if (!Number.isInteger(branchIdNum) || branchIdNum <= 0) {
    return <PickupErrorState />;
  }

  const supabase = createServiceClient();
  const { startIso: todayStartIso, endIso: todayEndIso } =
    getVNDayUtcRange(getVNDateString());

  const branch = await getCachedPickupBranch(branchIdNum);

  if (
    !branch ||
    !isPickupOperationalBranchKind(branch.branch_kind) ||
    branch.is_active !== true
  ) {
    notFound();
  }

  const tenantId = branch.tenant_id;

  const ticketResult = await fetchPickupVisibleTickets({
    supabase,
    tenantId,
    branchId: branchIdNum,
    todayStartIso,
  });

  if (ticketResult.error) {
    return <PickupErrorState />;
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
      ? fetchPickupOrdersByIds({
          supabase,
          tenantId,
          branchId: branchIdNum,
          orderIds,
        })
      : Promise.resolve({ data: [], error: null }),
    batchIds.length > 0
      ? fetchPickupKitchenBatchesByIds({
          supabase,
          tenantId,
          branchId: branchIdNum,
          batchIds,
        })
      : Promise.resolve({ data: [], error: null }),
    orderItemIds.length > 0
      ? fetchPickupOrderItemsByIds({ supabase, tenantId, orderItemIds })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (ordersRes.error || batchesRes.error || orderItemsRes.error) {
    return <PickupErrorState />;
  }

  const orderItems = (orderItemsRes.data ?? []) as PickupOrderItemQuantityRow[];
  const queue = buildPickupQueue({
    tickets,
    orders: (ordersRes.data ?? []) as BuildPickupQueueInput["orders"],
    kitchenBatches: (batchesRes.data ??
      []) as BuildPickupQueueInput["kitchenBatches"],
    orderItems,
  });

  const quantityByOrderItemId = new Map(
    orderItems.map((row) => [row.id, normalizeQuantity(row.quantity)]),
  );
  const orderItemIdByTicketId = new Map(
    tickets.map((ticket) => [ticket.id, ticket.order_item_id]),
  );
  const rows = queue
    .filter(isPickupGuestBoardVisible)
    .map((item, index) =>
      toPickupListRow({
        item,
        index,
        orderItemIdByTicketId,
        quantityByOrderItemId,
      }),
    );
  let idleState: PickupIdleState | null = null;

  if (rows.length === 0) {
    const todayTicketCountResult = await fetchPickupTodayTicketCount({
      supabase,
      tenantId,
      branchId: branchIdNum,
      todayStartIso,
      todayEndIso,
    });

    if (todayTicketCountResult.error) {
      return <PickupErrorState />;
    }

    idleState = todayTicketCountResult.count > 0 ? "done" : "empty";
  }

  const nowMs = await requestNowMs();

  return (
    <>
      <PickupRealtimeRefresh />

      <section
        aria-label={`${PICKUP_COPY.eyebrow} ${branch.name}`}
        className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background"
      >
        <PickupOrderScreen rows={rows} nowMs={nowMs} idleState={idleState} />
      </section>
    </>
  );
}

function PickupOrderScreen({
  rows,
  nowMs,
  idleState,
}: {
  rows: PickupListRow[];
  nowMs: number;
  idleState: PickupIdleState | null;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <PickupOrderBoardClient rows={rows} nowMs={nowMs} idleState={idleState} />
      <PickupFooter />
    </div>
  );
}

function PickupFooter() {
  return (
    <footer className="shrink-0">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border bg-muted/50 px-4 py-2 font-heading text-pickup-footer font-semibold text-foreground xl:gap-x-16 xl:py-4">
        <span>{PICKUP_COPY.footer.wifi}</span>
        <span>{PICKUP_COPY.footer.password}</span>
      </div>
    </footer>
  );
}

function toPickupListRow({
  item,
  index,
  orderItemIdByTicketId,
  quantityByOrderItemId,
}: {
  item: PickupQueueItem;
  index: number;
  orderItemIdByTicketId: Map<number, number>;
  quantityByOrderItemId: Map<number, number>;
}): PickupListRow {
  return {
    key: item.id,
    orderLabel: formatPickupOrderLabel(item),
    itemQuantity: countItemQuantity({
      item,
      orderItemIdByTicketId,
      quantityByOrderItemId,
    }),
    status: resolvePickupListStatus(index),
    sortAt: item.sortAt,
    callLane: item.callLane,
    deliveryPlatform: item.deliveryPlatform,
  };
}

function countItemQuantity({
  item,
  orderItemIdByTicketId,
  quantityByOrderItemId,
}: {
  item: PickupQueueItem;
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

function resolvePickupListStatus(index: number): PickupListStatus {
  return index === 0 ? "in_progress" : "pending";
}

function normalizeQuantity(value: number | string | null): number {
  const quantity = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return quantity;
}

function PickupErrorState() {
  return (
    <section className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-background p-4">
      <AppEmptyState
        mode="error"
        description={PICKUP_ERROR_MESSAGE}
        descriptionClassName="max-w-md text-sm"
        icon={<IconAlertCircle />}
        iconClassName="size-12 border border-border/70 bg-background/80 text-destructive"
        title={PICKUP_ERROR_TITLE}
        titleClassName="text-xl font-semibold tracking-tight sm:text-2xl"
      >
        <Badge variant="destructive">
          <IconAlertCircle className="size-3.5" />
          <span>{PICKUP_ERROR_BADGE}</span>
        </Badge>
      </AppEmptyState>
    </section>
  );
}
