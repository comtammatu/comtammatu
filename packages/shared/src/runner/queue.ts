export type RunnerTicketStatus = "pending" | "preparing" | "ready" | "served";
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

export interface RunnerKitchenBatchRow {
  id: number;
  order_id: number;
  kitchen_ticket_number: string;
  send_seq: number;
  kind: string;
  created_at: string;
}

export type RunnerQueueLane = "preparing" | "served";

export interface RunnerQueueItem {
  id: string;
  lane: RunnerQueueLane;
  ticketIds: number[];
  readyTicketIds: number[];
  orderId: number;
  orderNumber: string;
  orderReceivedAt: string;
  callNumber: string;
  callPrefix: "Bàn" | "Số";
  referenceNumber: string;
  referenceNumbers: string[];
  orderType: RunnerOrderType;
  targetKey: string;
  tableNumber: number | null;
  ticketCount: number;
  sortAt: string;
}

export interface BuildRunnerQueueInput {
  tickets: RunnerTicketRow[];
  orders: RunnerOrderRow[];
  kitchenBatches: RunnerKitchenBatchRow[];
  servedAfterIso?: string;
}

const HIDDEN_ORDER_STATUSES = new Set(["completed", "cancelled"]);

export function buildRunnerQueue(
  input: BuildRunnerQueueInput,
): RunnerQueueItem[] {
  const orderById = new Map(input.orders.map((order) => [order.id, order]));
  const batchById = new Map(
    input.kitchenBatches.map((batch) => [batch.id, batch]),
  );
  const groupByKey = new Map<string, RunnerQueueItem>();

  for (const ticket of input.tickets) {
    if (!isRunnerTicketStatus(ticket.status)) continue;

    const order = orderById.get(ticket.order_id);
    if (!order || HIDDEN_ORDER_STATUSES.has(order.status)) continue;

    const batch =
      ticket.kitchen_send_batch_id === null
        ? null
        : (batchById.get(ticket.kitchen_send_batch_id) ?? null);
    const lane = laneForTicketStatus(ticket.status);
    const sortAt = sortAtForTicket(ticket);
    if (
      lane === "served" &&
      input.servedAfterIso &&
      sortAt < input.servedAfterIso
    ) {
      continue;
    }

    const tableNumber = order.tables?.number ?? null;
    const displayTarget = resolveDisplayTarget(order, batch, tableNumber);
    const groupKey = `${resolveGroupKey(order, batch, tableNumber)}-${ticket.status}`;

    const existing = groupByKey.get(groupKey);
    if (existing) {
      existing.ticketCount += 1;
      existing.ticketIds = mergeNumbers(existing.ticketIds, ticket.id);
      if (ticket.status === "ready") {
        existing.readyTicketIds = mergeNumbers(
          existing.readyTicketIds,
          ticket.id,
        );
      }
      existing.sortAt = minIso(existing.sortAt, sortAt);
      existing.referenceNumbers = mergeReferences(
        existing.referenceNumbers,
        displayTarget.referenceNumber,
      );
      existing.referenceNumber = formatReferences(existing.referenceNumbers);
      continue;
    }

    groupByKey.set(groupKey, {
      id: groupKey,
      lane,
      ticketIds: [ticket.id],
      readyTicketIds: ticket.status === "ready" ? [ticket.id] : [],
      orderId: order.id,
      orderNumber: order.order_number,
      orderReceivedAt: order.created_at,
      callNumber: displayTarget.callNumber,
      callPrefix: displayTarget.callPrefix,
      referenceNumber: displayTarget.referenceNumber,
      referenceNumbers: [displayTarget.referenceNumber],
      orderType: order.order_type,
      targetKey: displayTarget.targetKey,
      tableNumber,
      ticketCount: 1,
      sortAt,
    });
  }

  const items = Array.from(groupByKey.values());
  const preparingTargetKeys = new Set(
    items
      .filter((item) => item.lane === "preparing")
      .map((item) => item.targetKey),
  );

  return items
    .filter((item) => {
      if (item.lane === "preparing") return true;
      return !preparingTargetKeys.has(item.targetKey);
    })
    .sort(compareRunnerQueueItems);
}

function isRunnerTicketStatus(status: string): status is RunnerTicketStatus {
  return (
    status === "pending" ||
    status === "preparing" ||
    status === "ready" ||
    status === "served"
  );
}

function laneForTicketStatus(status: RunnerTicketStatus): RunnerQueueLane {
  return status === "pending" || status === "preparing"
    ? "preparing"
    : "served";
}

function sortAtForTicket(ticket: RunnerTicketRow): string {
  if (ticket.status === "ready" || ticket.status === "served") {
    return ticket.bumped_at ?? ticket.updated_at ?? ticket.created_at;
  }
  return ticket.created_at;
}

function minIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function resolveDisplayTarget(
  order: RunnerOrderRow,
  batch: RunnerKitchenBatchRow | null,
  tableNumber: number | null,
): {
  callNumber: string;
  callPrefix: "Bàn" | "Số";
  referenceNumber: string;
  targetKey: string;
} {
  const fallbackNumber = batch?.kitchen_ticket_number ?? order.order_number;

  if (tableNumber !== null) {
    return {
      callNumber: String(tableNumber),
      callPrefix: "Bàn",
      referenceNumber: fallbackNumber,
      targetKey: `table-${String(order.table_id ?? tableNumber)}`,
    };
  }

  return {
    callNumber: fallbackNumber,
    callPrefix: "Số",
    referenceNumber: fallbackNumber,
    targetKey:
      batch === null
        ? `order-${String(order.id)}`
        : `batch-${String(batch.id)}`,
  };
}

function resolveGroupKey(
  order: RunnerOrderRow,
  batch: RunnerKitchenBatchRow | null,
  tableNumber: number | null,
): string {
  if (tableNumber !== null) return `order-${String(order.id)}`;
  return batch === null
    ? `order-${String(order.id)}`
    : `batch-${String(batch.id)}`;
}

function mergeReferences(existing: string[], next: string): string[] {
  if (existing.includes(next)) return existing;
  return [...existing, next];
}

function mergeNumbers(existing: number[], next: number): number[] {
  if (existing.includes(next)) return existing;
  return [...existing, next];
}

function formatReferences(references: string[]): string {
  if (references.length <= 2) return references.join(" / ");
  return `${references[0] ?? ""} / ${references[1] ?? ""} +${String(references.length - 2)}`;
}

function compareRunnerQueueItems(
  a: RunnerQueueItem,
  b: RunnerQueueItem,
): number {
  const laneDelta = laneRank(a.lane) - laneRank(b.lane);
  if (laneDelta !== 0) return laneDelta;

  const aTime = new Date(a.sortAt).getTime();
  const bTime = new Date(b.sortAt).getTime();
  const timeDelta = a.lane === "served" ? bTime - aTime : aTime - bTime;
  if (timeDelta !== 0) return timeDelta;

  return a.callNumber.localeCompare(b.callNumber, "vi", { numeric: true });
}

function laneRank(lane: RunnerQueueLane): number {
  if (lane === "preparing") return 0;
  return 1;
}
