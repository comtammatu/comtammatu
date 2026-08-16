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

type PosOrderMutationStateInput = {
  status: string;
  payment_status: string | null;
  payment_method: string | null;
};

export function isPosOrderAmountLocked(
  order: Pick<PosOrderMutationStateInput, "payment_method" | "payment_status">,
): boolean {
  return order.payment_status !== "paid" && order.payment_method === "vietqr";
}

/** Show append even when VietQR is pending — click-time confirm unlocks. */
export function canOfferPosOrderAppend(
  order: PosOrderMutationStateInput,
  activeStatuses: readonly string[],
): boolean {
  return (
    order.payment_status !== "paid" &&
    activeStatuses.includes(order.status)
  );
}

export function canAppendPosOrder(
  order: PosOrderMutationStateInput,
  activeStatuses: readonly string[],
): boolean {
  return (
    canOfferPosOrderAppend(order, activeStatuses) &&
    !isPosOrderAmountLocked(order)
  );
}

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
      order.status === "ready" || order.status === "served"
        ? "served"
        : "active";

    if (nextState === "active") {
      map.set(tableId, "active");
    } else if (!map.has(tableId)) {
      map.set(tableId, "served");
    }
  }

  return map;
}

export type PosTableTileTone = "default" | "success" | "warning" | "muted";

/**
 * Tile tone. `ready`/`served` derive from the SAME canonical status -> variant
 * map the order-list badge uses (`getPosOrderStateVariant`). Kitchen complete
 * collapses to dining (`served`) on the floor — POS never waits for a separate
 * waiter serve tap. Unpaid uses the `order-payment` domain on the cashier
 * badge. `active` intentionally diverges: an occupied table stays amber as an
 * at-a-glance table-occupancy signal (a different axis from the order-status
 * badge, which is neutral for an in-progress order). `empty`/`muted` are
 * tile-only presentation states.
 */
export function getPosTableTileTone(
  state: PosTableTileVisualState,
): PosTableTileTone {
  switch (state) {
    case "active":
      return "warning";
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
  // Kitchen `ready` and waiter `served` are the same floor signal: dining /
  // waiting for payment. Prefer `served` so tiles never show "Chờ bưng".
  if (orderVisualState === "ready" || orderVisualState === "served") {
    return "served";
  }
  if (tableStatus === "occupied" || hasActiveOrder) return "active";
  return "muted";
}
