export type PosTableOrderVisualState = "active" | "served";
export type PosTableTileVisualState = "empty" | "active" | "served" | "muted";

type PosTableOrderStateInput = {
  table_id: number | null;
  status: string;
  payment_status: string | null;
};

export function isActiveUnpaidPosOrder(
  order: PosTableOrderStateInput,
  activeStatuses: readonly string[],
): boolean {
  return (
    order.table_id !== null &&
    order.payment_status !== "paid" &&
    activeStatuses.includes(order.status)
  );
}

export function deriveTableOrderVisualStates(
  orders: readonly PosTableOrderStateInput[],
  activeStatuses: readonly string[],
): Map<number, PosTableOrderVisualState> {
  const map = new Map<number, PosTableOrderVisualState>();

  for (const order of orders) {
    if (!isActiveUnpaidPosOrder(order, activeStatuses)) continue;

    const tableId = order.table_id;
    if (tableId === null || map.get(tableId) === "active") continue;

    map.set(tableId, order.status === "served" ? "served" : "active");
  }

  return map;
}

export function getPosTableTileVisualState({
  tableStatus,
  orderCount,
  orderVisualState,
}: {
  tableStatus: string;
  orderCount: number;
  orderVisualState?: PosTableOrderVisualState;
}): PosTableTileVisualState {
  const hasActiveOrder = orderVisualState != null || orderCount > 0;
  if (tableStatus === "available" && !hasActiveOrder) return "empty";
  if (orderVisualState === "served") return "served";
  if (tableStatus === "occupied" || hasActiveOrder) return "active";
  return "muted";
}
