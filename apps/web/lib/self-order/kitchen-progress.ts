export type KitchenTicketProgress = {
  status?: unknown;
  first_ready_at?: unknown;
};

export function resolveSelfOrderKitchenProgress({
  orderStatus,
  tickets,
}: {
  orderStatus?: string | null;
  tickets?: KitchenTicketProgress[] | null;
}): { kitchenReady: boolean; kitchenServed: boolean } {
  const orderReady = orderStatus === "ready" || orderStatus === "served";
  const orderServed = orderStatus === "served";

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return { kitchenReady: orderReady, kitchenServed: orderServed };
  }

  let readyCount = 0;
  let servedCount = 0;
  let activeCount = 0;
  for (const row of tickets) {
    const status = typeof row.status === "string" ? row.status : "";
    if (status === "cancelled") continue;
    activeCount += 1;
    if (status === "served") {
      servedCount += 1;
      readyCount += 1;
      continue;
    }
    if (status === "ready") readyCount += 1;
  }

  return {
    kitchenReady: orderReady || readyCount > 0,
    kitchenServed:
      orderServed || (activeCount > 0 && servedCount === activeCount),
  };
}
