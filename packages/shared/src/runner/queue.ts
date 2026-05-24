export type RunnerTicketStatus = "pending" | "preparing" | "ready";
export type RunnerOrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "served"
  | "completed"
  | "cancelled"
  | string;

export type RunnerOrderType = "dine_in" | "takeaway" | string;

export interface RunnerTicketRow {
  id: number;
  order_id: number;
  order_item_id: number;
  kitchen_send_batch_id: number | null;
  status: RunnerTicketStatus | string;
  bumped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunnerOrderRow {
  id: number;
  order_number: string;
  order_type: RunnerOrderType;
  table_id: number | null;
  status: RunnerOrderStatus;
  created_at: string;
  tables?: { number: number } | null;
}

export interface RunnerOrderItemRow {
  id: number;
  order_id: number;
  item_name: string;
  quantity: number;
  status: string;
}

export interface RunnerKitchenBatchRow {
  id: number;
  order_id: number;
  kitchen_ticket_number: string;
  send_seq: number;
  kind: string;
  created_at: string;
}

export type RunnerQueueLane = "calling" | "preparing" | "pending";

export interface RunnerQueueItem {
  id: string;
  lane: RunnerQueueLane;
  orderId: number;
  orderNumber: string;
  callNumber: string;
  orderType: RunnerOrderType;
  tableNumber: number | null;
  ticketCount: number;
  itemCount: number;
  itemPreview: string[];
  sortAt: string;
}

export interface BuildRunnerQueueInput {
  tickets: RunnerTicketRow[];
  orders: RunnerOrderRow[];
  orderItems: RunnerOrderItemRow[];
  kitchenBatches: RunnerKitchenBatchRow[];
}

const TERMINAL_ORDER_STATUSES = new Set(["served", "completed", "cancelled"]);

export function buildRunnerQueue(input: BuildRunnerQueueInput): RunnerQueueItem[] {
  const orderById = new Map(input.orders.map((order) => [order.id, order]));
  const itemById = new Map(input.orderItems.map((item) => [item.id, item]));
  const batchById = new Map(input.kitchenBatches.map((batch) => [batch.id, batch]));
  const groupByKey = new Map<string, RunnerQueueItem>();

  for (const ticket of input.tickets) {
    if (!isRunnerTicketStatus(ticket.status)) continue;

    const order = orderById.get(ticket.order_id);
    if (!order || TERMINAL_ORDER_STATUSES.has(order.status)) continue;

    const batch =
      ticket.kitchen_send_batch_id === null
        ? null
        : (batchById.get(ticket.kitchen_send_batch_id) ?? null);
    const groupKey =
      batch === null
        ? `order-${String(ticket.order_id)}-${ticket.status}`
        : `batch-${String(batch.id)}-${ticket.status}`;
    const lane = laneForTicketStatus(ticket.status);
    const sortAt = sortAtForTicket(ticket);
    const item = itemById.get(ticket.order_item_id);
    const itemName = item?.item_name?.trim() ?? "";
    const quantity = item?.quantity ?? 1;
    const preview = itemName
      ? [`${formatQuantity(quantity)} ${itemName}`]
      : [];

    const existing = groupByKey.get(groupKey);
    if (existing) {
      existing.ticketCount += 1;
      existing.itemCount += quantity;
      existing.sortAt = minIso(existing.sortAt, sortAt);
      existing.itemPreview = mergePreview(existing.itemPreview, preview);
      continue;
    }

    groupByKey.set(groupKey, {
      id: groupKey,
      lane,
      orderId: order.id,
      orderNumber: order.order_number,
      callNumber: batch?.kitchen_ticket_number ?? order.order_number,
      orderType: order.order_type,
      tableNumber: order.tables?.number ?? null,
      ticketCount: 1,
      itemCount: quantity,
      itemPreview: preview,
      sortAt,
    });
  }

  return Array.from(groupByKey.values()).sort(compareRunnerQueueItems);
}

function isRunnerTicketStatus(status: string): status is RunnerTicketStatus {
  return status === "pending" || status === "preparing" || status === "ready";
}

function laneForTicketStatus(status: RunnerTicketStatus): RunnerQueueLane {
  if (status === "ready") return "calling";
  if (status === "preparing") return "preparing";
  return "pending";
}

function sortAtForTicket(ticket: RunnerTicketRow): string {
  if (ticket.status === "ready") {
    return ticket.bumped_at ?? ticket.updated_at ?? ticket.created_at;
  }
  return ticket.created_at;
}

function minIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function compareRunnerQueueItems(a: RunnerQueueItem, b: RunnerQueueItem): number {
  const laneDelta = laneRank(a.lane) - laneRank(b.lane);
  if (laneDelta !== 0) return laneDelta;

  const timeDelta = new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime();
  if (timeDelta !== 0) return timeDelta;

  return a.callNumber.localeCompare(b.callNumber, "vi", { numeric: true });
}

function laneRank(lane: RunnerQueueLane): number {
  if (lane === "calling") return 0;
  if (lane === "preparing") return 1;
  return 2;
}

function mergePreview(existing: string[], next: string[]): string[] {
  const merged = [...existing];
  for (const item of next) {
    if (merged.includes(item)) continue;
    merged.push(item);
  }
  return merged.slice(0, 4);
}

function formatQuantity(value: number): string {
  return `${Number.isInteger(value) ? String(value) : value.toFixed(2)}x`;
}
