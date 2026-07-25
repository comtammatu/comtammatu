type OrderKdsEvent = {
  id?: number;
  event_type: string;
  ticket_id: number;
  order_item_id: number;
  occurred_at?: string;
  item_snapshot: Record<string, unknown>;
  context: Record<string, unknown>;
};

export type OrderItemKitchenEvidenceState =
  | "in_progress"
  | "completed"
  | "cancelled"
  | "history_incomplete"
  | "needs_review";

export type OrderItemKitchenEvidence = {
  state: OrderItemKitchenEvidenceState;
  completedQuantity: number | null;
  latestEventType: string | null;
};

export type OrderKdsEvidenceSummary = {
  completedTicketCount: number;
  completedItemQuantity: number;
  legacyCompletedTicketCount: number;
  legacyCompletedItemQuantity: number;
};

export type OrderOperationalVerdict =
  | "cancelled"
  | "in_progress"
  | "payment_needs_review"
  | "print_needs_review"
  | "kitchen_needs_review"
  | "history_incomplete"
  | "recorded";

function quantityOf(event: OrderKdsEvent): number {
  const quantity = event.item_snapshot.quantity;
  return typeof quantity === "number" && Number.isFinite(quantity)
    ? quantity
    : 0;
}

function isLegacyEvent(event: OrderKdsEvent): boolean {
  return event.context.evidence_source === "legacy_live_snapshot";
}

function isCompletedEvent(event: OrderKdsEvent): boolean {
  return event.event_type === "completed" || event.event_type === "served";
}

type IndexedEvent = {
  event: OrderKdsEvent;
  index: number;
};

function compareEvents(left: IndexedEvent, right: IndexedEvent): number {
  const leftTime = left.event.occurred_at
    ? Date.parse(left.event.occurred_at)
    : Number.NaN;
  const rightTime = right.event.occurred_at
    ? Date.parse(right.event.occurred_at)
    : Number.NaN;

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    if (leftTime !== rightTime) return leftTime - rightTime;
    const leftId = left.event.id ?? 0;
    const rightId = right.event.id ?? 0;
    if (leftId !== rightId) return leftId - rightId;
  }

  if (isLegacyEvent(left.event) !== isLegacyEvent(right.event)) {
    return isLegacyEvent(left.event) ? -1 : 1;
  }

  return left.index - right.index;
}

function latestTicketEvents(events: readonly OrderKdsEvent[]): IndexedEvent[] {
  const latestByTicket = new Map<number, IndexedEvent>();

  events.forEach((event, index) => {
    const candidate = { event, index };
    const current = latestByTicket.get(event.ticket_id);
    if (!current || compareEvents(current, candidate) < 0) {
      latestByTicket.set(event.ticket_id, candidate);
    }
  });

  return [...latestByTicket.values()];
}

export function summarizeOrderItemKdsEvidence(
  events: readonly OrderKdsEvent[],
): Map<number, OrderItemKitchenEvidence> {
  const latestByItem = new Map<number, IndexedEvent[]>();

  for (const indexedEvent of latestTicketEvents(events)) {
    const itemEvents = latestByItem.get(indexedEvent.event.order_item_id) ?? [];
    itemEvents.push(indexedEvent);
    latestByItem.set(indexedEvent.event.order_item_id, itemEvents);
  }

  return new Map(
    [...latestByItem.entries()].map(([orderItemId, itemEvents]) => {
      const hasCanonicalEvent = itemEvents.some(
        ({ event }) => !isLegacyEvent(event),
      );
      const relevantEvents = hasCanonicalEvent
        ? itemEvents.filter(({ event }) => !isLegacyEvent(event))
        : itemEvents;
      const latestEvent = relevantEvents.reduce((latest, candidate) =>
        compareEvents(latest, candidate) < 0 ? candidate : latest,
      );
      const eventTypes = relevantEvents.map(({ event }) => event.event_type);
      const allCompleted = relevantEvents.every(({ event }) =>
        isCompletedEvent(event),
      );
      const allCancelled = eventTypes.every(
        (eventType) =>
          eventType === "cancelled" || eventType === "out_of_stock",
      );
      const hasActiveWork = eventTypes.some((eventType) =>
        ["sent", "preparing", "recalled"].includes(eventType),
      );

      let state: OrderItemKitchenEvidenceState;
      if (!hasCanonicalEvent) {
        state = "history_incomplete";
      } else if (allCompleted) {
        state = "completed";
      } else if (allCancelled) {
        state = "cancelled";
      } else if (hasActiveWork) {
        state = "in_progress";
      } else {
        state = "needs_review";
      }

      const completedQuantity = allCompleted
        ? Math.max(...relevantEvents.map(({ event }) => quantityOf(event)), 0)
        : null;

      return [
        orderItemId,
        {
          state,
          completedQuantity,
          latestEventType: latestEvent.event.event_type,
        },
      ];
    }),
  );
}

export function summarizeOrderKdsEvidence(
  events: readonly OrderKdsEvent[],
): OrderKdsEvidenceSummary {
  const latestEvents = latestTicketEvents(events);
  const itemEvidence = summarizeOrderItemKdsEvidence(events);
  const canonicalItemIds = new Set(
    latestEvents
      .filter(({ event }) => !isLegacyEvent(event))
      .map(({ event }) => event.order_item_id),
  );
  const canonicalTickets = latestEvents.filter(
    ({ event }) =>
      !isLegacyEvent(event) &&
      isCompletedEvent(event) &&
      itemEvidence.get(event.order_item_id)?.state === "completed",
  );
  const legacyTickets = latestEvents.filter(
    ({ event }) =>
      isLegacyEvent(event) &&
      !canonicalItemIds.has(event.order_item_id) &&
      isCompletedEvent(event) &&
      itemEvidence.get(event.order_item_id)?.completedQuantity != null,
  );

  let completedItemQuantity = 0;
  let legacyCompletedItemQuantity = 0;

  for (const evidence of itemEvidence.values()) {
    if (evidence.state === "completed") {
      completedItemQuantity += evidence.completedQuantity ?? 0;
    } else if (evidence.state === "history_incomplete") {
      legacyCompletedItemQuantity += evidence.completedQuantity ?? 0;
    }
  }

  return {
    completedTicketCount: canonicalTickets.length,
    completedItemQuantity,
    legacyCompletedTicketCount: legacyTickets.length,
    legacyCompletedItemQuantity,
  };
}

export function resolveOrderOperationalVerdict(input: {
  orderStatus: string;
  itemQuantity: number;
  legacyUnclassifiedQuantity: number;
  kds: OrderKdsEvidenceSummary;
  printJobCount: number;
  printedJobCount: number;
  missingReconciliationCount: number;
}): OrderOperationalVerdict {
  if (input.orderStatus === "cancelled") return "cancelled";

  if (input.missingReconciliationCount > 0) return "payment_needs_review";
  if (input.printedJobCount < input.printJobCount) return "print_needs_review";

  if (
    input.legacyUnclassifiedQuantity > 0 ||
    input.kds.legacyCompletedItemQuantity > 0
  ) {
    return "history_incomplete";
  }

  const hasKitchenGap = input.kds.completedItemQuantity < input.itemQuantity;

  if (input.orderStatus === "served" && hasKitchenGap) {
    return "kitchen_needs_review";
  }
  if (input.orderStatus !== "completed") return "in_progress";

  return hasKitchenGap ? "kitchen_needs_review" : "recorded";
}
