"use client";

import { useCallback, useState } from "react";

export type AppendTarget = {
  orderId: number;
  orderNumber: string;
};

/**
 * Append mode: cart items route to an existing order via appendOrderItems.
 * Transient state — not URL-persisted, cleared on navigation or Esc.
 */
export function useAppendTarget() {
  const [target, setTarget] = useState<AppendTarget | null>(null);

  const start = useCallback((orderId: number, orderNumber: string) => {
    setTarget({ orderId, orderNumber });
  }, []);

  const clear = useCallback(() => {
    setTarget(null);
  }, []);

  return { target, start, clear };
}
