import { formatVNElapsedCompact } from "@comtammatu/shared/time";
import type { PosTableOrderVisualState } from "./table-order-visual-state";
import { isActiveUnpaidPosOrder } from "./table-order-visual-state";

export const KITCHEN_WAIT_WARNING_MINUTES = 12;
export const KITCHEN_WAIT_URGENT_MINUTES = 20;

export type KitchenLatencyTone = "normal" | "warning" | "urgent";

export interface TableTimingInfo {
  tableId: number;
  seatingDuration: string | null;
  diningMinutes: number;
  kitchenWaitMinutes: number | null;
  kitchenWaitDuration: string | null;
  kitchenLatencyTone: KitchenLatencyTone | null;
  isReadyOverdue: boolean;
  orderVisualState: PosTableOrderVisualState | null;
}

export interface OrderTimingInfo {
  orderId: number;
  elapsedDuration: string | null;
  elapsedMinutes: number;
  kitchenWaitMinutes: number | null;
  kitchenLatencyTone: KitchenLatencyTone | null;
  isReadyOverdue: boolean;
}

type PosOrderTimingInput = {
  id: number;
  table_id: number | null;
  status: string;
  payment_status: string | null;
  created_at: string;
  updated_at?: string;
};

const KITCHEN_WAITING_STATUSES = new Set(["new", "confirmed", "preparing"]);

/**
 * Calculates dining and kitchen preparation timing for each table in POS.
 */
export function deriveTableTimingMap<T extends PosOrderTimingInput>(
  orders: readonly T[],
  activeStatuses: readonly string[],
  now: number = Date.now(),
): Map<number, TableTimingInfo> {
  const map = new Map<number, TableTimingInfo>();

  interface TableAccumulator {
    earliestDiningTime: number;
    earliestKitchenWaitTime: number | null;
    orderVisualState: PosTableOrderVisualState | null;
  }

  const accumulators = new Map<number, TableAccumulator>();

  for (const order of orders) {
    if (!isActiveUnpaidPosOrder(order, activeStatuses)) continue;

    const tableId = order.table_id;
    if (tableId === null) continue;

    const orderCreatedMs = new Date(order.created_at).getTime();
    if (Number.isNaN(orderCreatedMs)) continue;

    let acc = accumulators.get(tableId);
    if (!acc) {
      acc = {
        earliestDiningTime: orderCreatedMs,
        earliestKitchenWaitTime: null,
        orderVisualState: null,
      };
      accumulators.set(tableId, acc);
    } else if (orderCreatedMs < acc.earliestDiningTime) {
      acc.earliestDiningTime = orderCreatedMs;
    }

    if (KITCHEN_WAITING_STATUSES.has(order.status)) {
      if (
        acc.earliestKitchenWaitTime === null ||
        orderCreatedMs < acc.earliestKitchenWaitTime
      ) {
        acc.earliestKitchenWaitTime = orderCreatedMs;
      }
      acc.orderVisualState = "active";
    } else if (order.status === "ready" || order.status === "served") {
      // Kitchen complete already means food left the pass — no ready-pass
      // overdue / "Chờ bưng" signal on the POS floor.
      if (acc.orderVisualState === null) {
        acc.orderVisualState = "served";
      }
    }
  }

  for (const [tableId, acc] of accumulators.entries()) {
    const diningMinutes = Math.max(
      0,
      Math.floor((now - acc.earliestDiningTime) / 60_000),
    );
    const seatingDuration = formatVNElapsedCompact(
      new Date(acc.earliestDiningTime),
      new Date(now),
    );

    let kitchenWaitMinutes: number | null = null;
    let kitchenWaitDuration: string | null = null;
    let kitchenLatencyTone: KitchenLatencyTone | null = null;

    if (acc.earliestKitchenWaitTime !== null) {
      kitchenWaitMinutes = Math.max(
        0,
        Math.floor((now - acc.earliestKitchenWaitTime) / 60_000),
      );
      kitchenWaitDuration = formatVNElapsedCompact(
        new Date(acc.earliestKitchenWaitTime),
        new Date(now),
      );
      if (kitchenWaitMinutes >= KITCHEN_WAIT_URGENT_MINUTES) {
        kitchenLatencyTone = "urgent";
      } else if (kitchenWaitMinutes >= KITCHEN_WAIT_WARNING_MINUTES) {
        kitchenLatencyTone = "warning";
      } else {
        kitchenLatencyTone = "normal";
      }
    }

    map.set(tableId, {
      tableId,
      seatingDuration,
      diningMinutes,
      kitchenWaitMinutes,
      kitchenWaitDuration,
      kitchenLatencyTone,
      isReadyOverdue: false,
      orderVisualState: acc.orderVisualState,
    });
  }

  return map;
}

/**
 * Calculates timing and latency tone for a single POS order card.
 */
export function deriveOrderTimingInfo<T extends PosOrderTimingInput>(
  order: T,
  now: number = Date.now(),
): OrderTimingInfo {
  const createdMs = new Date(order.created_at).getTime();
  const elapsedMinutes = Number.isNaN(createdMs)
    ? 0
    : Math.max(0, Math.floor((now - createdMs) / 60_000));
  const elapsedDuration = Number.isNaN(createdMs)
    ? null
    : formatVNElapsedCompact(new Date(createdMs), new Date(now));

  let kitchenWaitMinutes: number | null = null;
  let kitchenLatencyTone: KitchenLatencyTone | null = null;

  if (KITCHEN_WAITING_STATUSES.has(order.status)) {
    kitchenWaitMinutes = elapsedMinutes;
    if (elapsedMinutes >= KITCHEN_WAIT_URGENT_MINUTES) {
      kitchenLatencyTone = "urgent";
    } else if (elapsedMinutes >= KITCHEN_WAIT_WARNING_MINUTES) {
      kitchenLatencyTone = "warning";
    } else {
      kitchenLatencyTone = "normal";
    }
  }

  const isReadyOverdue = false;

  return {
    orderId: order.id,
    elapsedDuration,
    elapsedMinutes,
    kitchenWaitMinutes,
    kitchenLatencyTone,
    isReadyOverdue,
  };
}
