export interface KdsCompletionHistoryTicket {
  id: number;
  order_id: number;
  order_item_id: number;
  kitchen_send_batch_id: number | null;
  status: string;
  bumped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KdsCompletionHistoryOrderInfo {
  id: number;
  order_number: string;
  order_type: string;
  table_id: number | null;
  created_at: string;
  tables: { number: number } | null;
}

export interface KdsCompletionHistoryOrderItem {
  id: number;
  order_id: number;
  item_name: string;
  quantity: number;
  status: string;
}

export interface KdsCompletionHistoryBatch {
  id: number;
  order_id: number;
  kitchen_ticket_number: string;
  send_seq: number;
  kind: string;
  created_at: string;
}

export interface KdsCompletionHistoryEntryItem {
  id: number;
  name: string;
  quantity: number;
  status: string;
}

export interface KdsCompletionHistoryEntry {
  groupKey: string;
  orderId: number;
  orderNumber: string;
  kitchenTicketNumber: string;
  orderType: string;
  tableNumber: number | null;
  completedAt: string;
  ticketCount: number;
  itemCount: number;
  itemQuantity: number;
  items: KdsCompletionHistoryEntryItem[];
}

function getCompletionGroupKey(ticket: KdsCompletionHistoryTicket): string {
  return ticket.kitchen_send_batch_id === null
    ? `order-${String(ticket.order_id)}`
    : `batch-${String(ticket.kitchen_send_batch_id)}`;
}

function getTicketCompletedAt(ticket: KdsCompletionHistoryTicket): string {
  return ticket.bumped_at ?? ticket.updated_at ?? ticket.created_at;
}

function compareIsoDesc(a: string, b: string): number {
  const delta = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(delta) && delta !== 0 ? delta : b.localeCompare(a);
}

export function buildKdsCompletionHistory(args: {
  tickets: KdsCompletionHistoryTicket[];
  orders: KdsCompletionHistoryOrderInfo[];
  items: KdsCompletionHistoryOrderItem[];
  batches: KdsCompletionHistoryBatch[];
  limit: number;
}): KdsCompletionHistoryEntry[] {
  const ordersById = new Map(args.orders.map((order) => [order.id, order]));
  const itemsById = new Map(args.items.map((item) => [item.id, item]));
  const batchesById = new Map(args.batches.map((batch) => [batch.id, batch]));
  const ticketGroups = new Map<string, KdsCompletionHistoryTicket[]>();

  for (const ticket of args.tickets) {
    const groupKey = getCompletionGroupKey(ticket);
    const existing = ticketGroups.get(groupKey) ?? [];
    existing.push(ticket);
    ticketGroups.set(groupKey, existing);
  }

  const entries: KdsCompletionHistoryEntry[] = [];
  for (const [groupKey, groupTickets] of ticketGroups) {
    const firstTicket = groupTickets[0];
    if (!firstTicket) continue;

    const order = ordersById.get(firstTicket.order_id);
    const batch =
      firstTicket.kitchen_send_batch_id === null
        ? null
        : (batchesById.get(firstTicket.kitchen_send_batch_id) ?? null);
    const completedAt = groupTickets
      .map(getTicketCompletedAt)
      .sort(compareIsoDesc)[0];

    if (!completedAt) continue;

    const uniqueItems = [
      ...new Map(
        groupTickets
          .map((ticket) => itemsById.get(ticket.order_item_id))
          .filter(
            (item): item is KdsCompletionHistoryOrderItem =>
              item !== undefined,
          )
          .map((item) => [item.id, item]),
      ).values(),
    ].sort((a, b) => a.id - b.id);

    entries.push({
      groupKey,
      orderId: firstTicket.order_id,
      orderNumber: order?.order_number ?? String(firstTicket.order_id),
      kitchenTicketNumber:
        batch?.kitchen_ticket_number ??
        order?.order_number ??
        `#${String(firstTicket.order_id)}`,
      orderType: order?.order_type ?? "dine_in",
      tableNumber: order?.tables?.number ?? null,
      completedAt,
      ticketCount: groupTickets.length,
      itemCount: uniqueItems.length,
      itemQuantity: uniqueItems.reduce((sum, item) => sum + item.quantity, 0),
      items: uniqueItems.map((item) => ({
        id: item.id,
        name: item.item_name,
        quantity: item.quantity,
        status: item.status,
      })),
    });
  }

  return entries
    .sort((a, b) => {
      const timeDelta = compareIsoDesc(a.completedAt, b.completedAt);
      if (timeDelta !== 0) return timeDelta;
      return a.groupKey.localeCompare(b.groupKey);
    })
    .slice(0, Math.max(0, args.limit));
}
