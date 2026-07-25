type OrderKdsEvent = {
  event_type: string;
  ticket_id: number;
  order_item_id: number;
  item_snapshot: Record<string, unknown>;
  context: Record<string, unknown>;
};

export type OrderKdsEvidenceSummary = {
  completedTicketCount: number;
  completedItemQuantity: number;
  legacyCompletedTicketCount: number;
  legacyCompletedItemQuantity: number;
};

function quantityOf(event: OrderKdsEvent): number {
  const quantity = event.item_snapshot.quantity;
  return typeof quantity === "number" && Number.isFinite(quantity)
    ? quantity
    : 0;
}

export function summarizeOrderKdsEvidence(
  events: readonly OrderKdsEvent[],
): OrderKdsEvidenceSummary {
  const canonicalItems = new Map<number, number>();
  const canonicalTickets = new Set<number>();
  const legacyItems = new Map<number, { quantity: number; ticketId: number }>();

  for (const event of events) {
    if (event.event_type !== "completed") continue;

    if (event.context.evidence_source === "legacy_live_snapshot") {
      legacyItems.set(event.order_item_id, {
        quantity: quantityOf(event),
        ticketId: event.ticket_id,
      });
      continue;
    }

    canonicalItems.set(event.order_item_id, quantityOf(event));
    canonicalTickets.add(event.ticket_id);
  }

  for (const orderItemId of canonicalItems.keys()) {
    legacyItems.delete(orderItemId);
  }

  return {
    completedTicketCount: canonicalTickets.size,
    completedItemQuantity: [...canonicalItems.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    ),
    legacyCompletedTicketCount: new Set(
      [...legacyItems.values()].map((item) => item.ticketId),
    ).size,
    legacyCompletedItemQuantity: [...legacyItems.values()].reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
  };
}
