import { getPosOrderStateVariant } from "./order-status-display";

export type PosTableOrderVisualState = "active" | "ready" | "served";
export type PosTableTileVisualState =
  | "empty"
  | "active"
  | "ready"
  | "served"
  | "muted";

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

    const nextState =
      order.status === "served"
        ? "served"
        : order.status === "ready"
          ? "ready"
          : "active";

    if (nextState === "active") {
      map.set(tableId, "active");
    } else if (nextState === "ready") {
      map.set(tableId, "ready");
    } else if (!map.has(tableId)) {
      map.set(tableId, "served");
    }
  }

  return map;
}

export type PosTableTileTone = "default" | "success" | "warning" | "muted";

/**
 * Tile tone derives from the SAME canonical status -> variant map the
 * order-list badge uses (`getPosOrderStateVariant`), so one order renders one
 * color across the table tile and the list. `empty`/`muted` are tile-only
 * presentation states with no order workflow color.
 */
export function getPosTableTileTone(
  state: PosTableTileVisualState,
): PosTableTileTone {
  switch (state) {
    case "active":
    case "ready":
    case "served":
      return getPosOrderStateVariant(state);
    case "muted":
      return "muted";
    case "empty":
      return "default";
  }
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
  if (orderVisualState === "ready") return "ready";
  if (orderVisualState === "served") return "served";
  if (tableStatus === "occupied" || hasActiveOrder) return "active";
  return "muted";
}
