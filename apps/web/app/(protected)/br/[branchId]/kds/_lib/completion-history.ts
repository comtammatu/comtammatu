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

interface KdsCompletionHistoryEntryItem {
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

export interface KdsCompletionHistoryEvent {
  event_id: number;
  event_type:
    | "sent"
    | "preparing"
    | "completed"
    | "recalled"
    | "served"
    | "cancelled"
    | "out_of_stock";
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  order_id: number;
  ticket_id: number;
  order_item_id: number;
  station_id: number;
  kitchen_send_batch_id: number | null;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  item_snapshot: unknown;
  context: unknown;
  print_jobs: unknown;
}

export interface KdsOperationalHistoryEntry {
  eventId: number;
  eventType: KdsCompletionHistoryEvent["event_type"];
  occurredAt: string;
  actorName: string | null;
  orderId: number;
  orderNumber: string;
  orderType: string;
  tableNumber: number | null;
  ticketId: number;
  stationId: number;
  stationName: string | null;
  kitchenTicketNumber: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  itemName: string;
  variantName: string | null;
  quantity: number;
  modifiers: string[];
  sides: string[];
  note: string | null;
  evidenceSource: string | null;
  printJobs: Array<{
    id: number;
    jobType: string;
    status: string;
    createdAt: string;
  }>;
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
            (item): item is KdsCompletionHistoryOrderItem => item !== undefined,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNamedOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    const record = asRecord(option);
    if (typeof record.name !== "string") return [];
    const quantity =
      typeof record.quantity === "number" && record.quantity > 1
        ? `${String(record.quantity)}× `
        : "";
    return [`${quantity}${record.name}`];
  });
}

export function buildKdsOperationalHistory(args: {
  events: KdsCompletionHistoryEvent[];
  orders: KdsCompletionHistoryOrderInfo[];
  limit: number;
}): KdsOperationalHistoryEntry[] {
  const ordersById = new Map(args.orders.map((order) => [order.id, order]));

  return args.events.slice(0, Math.max(0, args.limit)).map((event) => {
    const order = ordersById.get(event.order_id);
    const snapshot = asRecord(event.item_snapshot);
    const context = asRecord(event.context);
    const printJobs = Array.isArray(event.print_jobs)
      ? event.print_jobs.flatMap((value) => {
          const job = asRecord(value);
          return typeof job.id === "number" &&
            typeof job.job_type === "string" &&
            typeof job.status === "string" &&
            typeof job.created_at === "string"
            ? [
                {
                  id: job.id,
                  jobType: job.job_type,
                  status: job.status,
                  createdAt: job.created_at,
                },
              ]
            : [];
        })
      : [];

    return {
      eventId: event.event_id,
      eventType: event.event_type,
      occurredAt: event.occurred_at,
      actorName: event.actor_name,
      orderId: event.order_id,
      orderNumber: order?.order_number ?? String(event.order_id),
      orderType: order?.order_type ?? "dine_in",
      tableNumber: order?.tables?.number ?? null,
      ticketId: event.ticket_id,
      stationId: event.station_id,
      stationName:
        typeof context.station_name === "string" ? context.station_name : null,
      kitchenTicketNumber:
        typeof context.kitchen_ticket_number === "string"
          ? context.kitchen_ticket_number
          : (order?.order_number ?? `#${String(event.order_id)}`),
      fromStatus: event.from_status,
      toStatus: event.to_status,
      reason: event.reason,
      itemName:
        typeof snapshot.item_name === "string"
          ? snapshot.item_name
          : `Món #${String(event.order_item_id)}`,
      variantName:
        typeof snapshot.variant_name === "string"
          ? snapshot.variant_name
          : null,
      quantity:
        typeof snapshot.quantity === "number" &&
        Number.isFinite(snapshot.quantity)
          ? snapshot.quantity
          : 0,
      modifiers: asNamedOptions(snapshot.modifiers),
      sides: asNamedOptions(snapshot.sides),
      note: typeof snapshot.note === "string" ? snapshot.note : null,
      evidenceSource:
        typeof context.evidence_source === "string"
          ? context.evidence_source
          : null,
      printJobs,
    };
  });
}

export function buildKdsCompletionHistoryFromEvents(args: {
  events: KdsCompletionHistoryEvent[];
  orders: KdsCompletionHistoryOrderInfo[];
  limit: number;
}): KdsCompletionHistoryEntry[] {
  const ordersById = new Map(args.orders.map((order) => [order.id, order]));
  const groups = new Map<string, KdsCompletionHistoryEvent[]>();

  for (const event of args.events) {
    const groupKey =
      event.kitchen_send_batch_id === null
        ? `order-${String(event.order_id)}`
        : `batch-${String(event.kitchen_send_batch_id)}`;
    const group = groups.get(groupKey) ?? [];
    group.push(event);
    groups.set(groupKey, group);
  }

  return [...groups.entries()]
    .flatMap<KdsCompletionHistoryEntry>(([groupKey, events]) => {
      const first = events[0];
      if (!first) return [];

      const order = ordersById.get(first.order_id);
      const latest = [...events].sort((a, b) =>
        compareIsoDesc(a.occurred_at, b.occurred_at),
      )[0];
      if (!latest) return [];

      const items: KdsCompletionHistoryEntryItem[] = [
        ...new Map(
          events.map((event) => {
            const snapshot = asRecord(event.item_snapshot);
            const quantity =
              typeof snapshot.quantity === "number" &&
              Number.isFinite(snapshot.quantity)
                ? snapshot.quantity
                : 0;
            return [
              event.order_item_id,
              {
                id: event.order_item_id,
                name:
                  typeof snapshot.item_name === "string"
                    ? snapshot.item_name
                    : `Món #${String(event.order_item_id)}`,
                quantity,
                status: "completed",
              },
            ] as const;
          }),
        ).values(),
      ].sort((a, b) => a.id - b.id);
      const context = asRecord(first.context);

      return [
        {
          groupKey,
          orderId: first.order_id,
          orderNumber: order?.order_number ?? String(first.order_id),
          kitchenTicketNumber:
            typeof context.kitchen_ticket_number === "string"
              ? context.kitchen_ticket_number
              : (order?.order_number ?? `#${String(first.order_id)}`),
          orderType: order?.order_type ?? "dine_in",
          tableNumber: order?.tables?.number ?? null,
          completedAt: latest.occurred_at,
          ticketCount: new Set(events.map((event) => event.ticket_id)).size,
          itemCount: items.length,
          itemQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
          items,
        },
      ];
    })
    .sort((a, b) => {
      const timeDelta = compareIsoDesc(a.completedAt, b.completedAt);
      return timeDelta !== 0 ? timeDelta : a.groupKey.localeCompare(b.groupKey);
    })
    .slice(0, Math.max(0, args.limit));
}
