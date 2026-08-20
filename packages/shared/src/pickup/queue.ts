import { formatDeliveryCallLabel } from "../delivery/call-label";

export type PickupTicketStatus = "pending" | "preparing" | "ready" | "served";
export type PickupOrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "served"
  | "completed"
  | "cancelled"
  | string;

export type PickupOrderType = "dine_in" | "takeaway" | "delivery" | string;

export interface PickupTicketRow {
  id: number;
  order_id: number;
  order_item_id?: number;
  kitchen_send_batch_id: number | null;
  status: PickupTicketStatus | string;
  bumped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickupOrderRow {
  id: number;
  order_number: string;
  order_type: PickupOrderType;
  table_id: number | null;
  status: PickupOrderStatus;
  created_at: string;
  is_priority?: boolean | null;
  delivery_platform?: string | null;
  external_order_ref?: string | null;
  tables?: { number: number } | null;
}

export interface PickupOrderItemRow {
  id: number;
  order_id?: number;
  is_priority?: boolean | null;
}

export interface PickupKitchenBatchRow {
  id: number;
  order_id: number;
  kitchen_ticket_number: string;
  send_seq: number;
  kind: string;
  created_at: string;
}

export type PickupQueueLane = "active" | "ready" | "served";

export type PickupCallLane = "dine_in" | "takeaway";

export interface PickupQueueItem {
  id: string;
  lane: PickupQueueLane;
  status: PickupTicketStatus;
  isPriority: boolean;
  ticketIds: number[];
  readyTicketIds: number[];
  orderId: number;
  orderNumber: string;
  orderReceivedAt: string;
  callNumber: string;
  callPrefix: "Bàn" | "Số";
  referenceNumber: string;
  referenceNumbers: string[];
  orderType: PickupOrderType;
  deliveryPlatform: string | null;
  externalOrderRef: string | null;
  callLane: PickupCallLane;
  targetKey: string;
  tableNumber: number | null;
  ticketCount: number;
  sortAt: string;
}

export interface BuildPickupQueueInput {
  tickets: PickupTicketRow[];
  orders: PickupOrderRow[];
  kitchenBatches: PickupKitchenBatchRow[];
  orderItems?: PickupOrderItemRow[];
  servedAfterIso?: string;
}

const ORDER_DATE_SEGMENT_PATTERN = /^\d{6}(?:\d{2})?$/;
const ORDER_SEQUENCE_SEGMENT_PATTERN = /^\d{1,5}$/;

export type PickupOrderLabelInput = Pick<
  PickupQueueItem,
  | "orderNumber"
  | "orderType"
  | "tableNumber"
  | "deliveryPlatform"
  | "externalOrderRef"
>;

export function getPickupCallLane(
  orderType: PickupOrderType | null | undefined,
): PickupCallLane {
  if (orderType === "delivery" || orderType === "takeaway") return "takeaway";
  return "dine_in";
}

/** Guest board: walk-in stays pending/preparing; delivery stays until KDS served. */
export function isPickupGuestBoardVisible(
  item: Pick<PickupQueueItem, "orderType" | "status">,
): boolean {
  if (item.status === "served") return false;
  if (item.orderType === "delivery") {
    return (
      item.status === "pending" ||
      item.status === "preparing" ||
      item.status === "ready"
    );
  }
  return item.status === "pending" || item.status === "preparing";
}

export function formatPickupOrderLabel(item: PickupOrderLabelInput): string {
  if (item.tableNumber !== null) return `Bàn ${String(item.tableNumber)}`;

  const externalRef = (item.externalOrderRef ?? "").trim();
  const isDelivery =
    item.orderType === "delivery" ||
    item.orderNumber.trim().toUpperCase().startsWith("GH-") ||
    externalRef.length > 0;

  if (isDelivery) {
    return formatDeliveryCallLabel({
      orderNumber: item.orderNumber,
      externalOrderRef: item.externalOrderRef,
      deliveryPlatform: item.deliveryPlatform,
    });
  }

  if (item.orderType === "takeaway") {
    const sequence = extractDateBasedOrderSequence(item.orderNumber);
    return sequence === null
      ? `Mang về ${item.orderNumber}`
      : `Mang về #${sequence}`;
  }

  return `Bàn chưa rõ ${item.orderNumber}`;
}

export function buildPickupQueue(
  input: BuildPickupQueueInput,
): PickupQueueItem[] {
  const orderById = new Map(input.orders.map((order) => [order.id, order]));
  const batchById = new Map(
    input.kitchenBatches.map((batch) => [batch.id, batch]),
  );
  const priorityOrderItemIds = new Set(
    (input.orderItems ?? [])
      .filter((item) => item.is_priority === true)
      .map((item) => item.id),
  );
  const groupByKey = new Map<string, PickupQueueItem>();

  for (const ticket of input.tickets) {
    if (!isPickupTicketStatus(ticket.status)) continue;

    const order = orderById.get(ticket.order_id);
    // Pickup follows KDS fulfillment state. POS `orders.status` may be
    // `completed` immediately after payment while kitchen work is still live.
    if (!order) continue;

    const batch =
      ticket.kitchen_send_batch_id === null
        ? null
        : (batchById.get(ticket.kitchen_send_batch_id) ?? null);
    const lane = laneForTicketStatus(ticket.status);
    const sortAt = sortAtForQueue(order, batch, ticket);
    if (
      lane === "served" &&
      input.servedAfterIso &&
      sortAt < input.servedAfterIso
    ) {
      continue;
    }

    const tableNumber = order.tables?.number ?? null;
    const displayTarget = resolveDisplayTarget(order, batch, tableNumber);
    const groupKey = resolveGroupKey(order, batch, tableNumber);
    const isTicketPriority =
      order.is_priority === true ||
      (ticket.order_item_id !== undefined &&
        priorityOrderItemIds.has(ticket.order_item_id));

    const existing = groupByKey.get(groupKey);
    if (existing) {
      existing.isPriority = existing.isPriority || isTicketPriority;
      existing.status = pickPickupQueueStatus(
        existing.status,
        ticket.status,
        existing.isPriority,
      );
      existing.lane = laneForTicketStatus(existing.status);
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
      status: ticket.status,
      isPriority: isTicketPriority,
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
      deliveryPlatform: order.delivery_platform ?? null,
      externalOrderRef: order.external_order_ref ?? null,
      callLane: getPickupCallLane(order.order_type),
      targetKey: displayTarget.targetKey,
      tableNumber,
      ticketCount: 1,
      sortAt,
    });
  }

  const items = Array.from(groupByKey.values());
  const activeTargetKeys = new Set(
    items
      .filter((item) => item.lane === "active")
      .map((item) => item.targetKey),
  );

  return items
    .filter((item) => {
      if (item.lane === "active") return true;
      return !activeTargetKeys.has(item.targetKey);
    })
    .sort(comparePickupQueueItems);
}

function isPickupTicketStatus(status: string): status is PickupTicketStatus {
  return (
    status === "pending" ||
    status === "preparing" ||
    status === "ready" ||
    status === "served"
  );
}

function laneForTicketStatus(status: PickupTicketStatus): PickupQueueLane {
  if (status === "pending" || status === "preparing") return "active";
  if (status === "ready") return "ready";
  return "served";
}

function sortAtForTicket(ticket: PickupTicketRow): string {
  if (ticket.status === "ready" || ticket.status === "served") {
    return ticket.bumped_at ?? ticket.updated_at ?? ticket.created_at;
  }
  return ticket.created_at;
}

function sortAtForQueue(
  order: PickupOrderRow,
  batch: PickupKitchenBatchRow | null,
  ticket: PickupTicketRow,
): string {
  if (ticket.status === "served") return sortAtForTicket(ticket);
  return batch?.created_at ?? order.created_at ?? ticket.created_at;
}

function minIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function resolveDisplayTarget(
  order: PickupOrderRow,
  batch: PickupKitchenBatchRow | null,
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
  order: PickupOrderRow,
  batch: PickupKitchenBatchRow | null,
  tableNumber: number | null,
): string {
  if (tableNumber !== null) return `order-${String(order.id)}`;
  return batch === null
    ? `order-${String(order.id)}`
    : `batch-${String(batch.id)}`;
}

function extractDateBasedOrderSequence(orderNumber: string): string | null {
  const parts = orderNumber
    .trim()
    .split(/[-_#\s]+/)
    .filter(Boolean);

  for (let index = 0; index < parts.length - 1; index += 1) {
    const current = parts[index];
    const next = parts[index + 1];
    if (
      current !== undefined &&
      next !== undefined &&
      ORDER_DATE_SEGMENT_PATTERN.test(current) &&
      ORDER_SEQUENCE_SEGMENT_PATTERN.test(next)
    ) {
      return next;
    }
  }

  return null;
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

function comparePickupQueueItems(
  a: PickupQueueItem,
  b: PickupQueueItem,
): number {
  const rankDelta = pickupQueueRank(a) - pickupQueueRank(b);
  if (rankDelta !== 0) return rankDelta;

  const aTime = new Date(a.sortAt).getTime();
  const bTime = new Date(b.sortAt).getTime();
  const timeDelta =
    a.status === "served" && b.status === "served"
      ? bTime - aTime
      : aTime - bTime;
  if (timeDelta !== 0) return timeDelta;

  return a.callNumber.localeCompare(b.callNumber, "vi", { numeric: true });
}

function pickPickupQueueStatus(
  current: PickupTicketStatus,
  next: PickupTicketStatus,
  isPriority: boolean,
): PickupTicketStatus {
  return pickupQueueStatusRank(current, isPriority) <=
    pickupQueueStatusRank(next, isPriority)
    ? current
    : next;
}

function pickupQueueRank(item: PickupQueueItem): number {
  return pickupQueueStatusRank(item.status, item.isPriority);
}

function pickupQueueStatusRank(
  status: PickupTicketStatus,
  isPriority: boolean,
): number {
  if (status === "pending" || status === "preparing") {
    return isPriority ? 0 : 1;
  }
  if (status === "ready") return 2;
  return 3;
}
