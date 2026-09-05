"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTIVE_POS_STATUSES, type SessionOrder } from "../order-history";
import { deriveTableTimingMap } from "../_lib/table-timing";
import {
  deriveTableOrderVisualStates,
  isActiveUnpaidPosOrder,
} from "../_lib/table-order-visual-state";

/**
 * Floor-grid maps that recompute from the live order snapshot. The 30s
 * clock is local so seating labels tick without a Realtime event.
 */
export function usePosTableDerived(orders: SessionOrder[]) {
  const orderCountByTable = useMemo(() => {
    const map = new Map<number, number>();
    for (const order of orders) {
      if (isActiveUnpaidPosOrder(order, ACTIVE_POS_STATUSES)) {
        const tableId = order.table_id;
        if (tableId !== null) map.set(tableId, (map.get(tableId) ?? 0) + 1);
      }
    }
    return map;
  }, [orders]);

  const tableOrderVisualStateByTable = useMemo(
    () => deriveTableOrderVisualStates(orders, ACTIVE_POS_STATUSES),
    [orders],
  );

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const tableTimingByTable = useMemo(
    () => deriveTableTimingMap(orders, ACTIVE_POS_STATUSES, nowMs),
    [orders, nowMs],
  );

  const tableSeatingTimeByTable = useMemo(() => {
    const formatted = new Map<number, string>();
    for (const [tableId, timing] of tableTimingByTable.entries()) {
      if (timing.seatingDuration) {
        formatted.set(tableId, timing.seatingDuration);
      }
    }
    return formatted;
  }, [tableTimingByTable]);

  return {
    orderCountByTable,
    tableOrderVisualStateByTable,
    tableTimingByTable,
    tableSeatingTimeByTable,
  };
}
