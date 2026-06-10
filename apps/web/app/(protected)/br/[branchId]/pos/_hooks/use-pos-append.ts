"use client";

import { useCallback, useRef } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { appendOrderItems } from "../order-actions";
import type { CartItem } from "../types";

export interface AppendTargetLike {
  orderId: number;
  orderNumber: string;
}

export interface UsePosAppendArgs {
  branchId: number;
  /** Refresh orders + tables snapshot after a successful append. */
  refreshOperational: () => Promise<void> | void;
}

export interface PerformAppendOptions {
  /** Caller-specific cleanup after a successful append (e.g. close customizer). */
  onSuccess?: () => void;
}

export interface UsePosAppendReturn {
  /**
   * Append one or more cart lines to an existing order, with:
   *   - per-call idempotency key (server dedupes double-tap / retries)
   *   - in-flight guard (second concurrent call short-circuits with a toast)
   *   - success orchestration: toast + caller cleanup + refresh
   * Safe to call from the explicit "Gửi món thêm" confirmation path.
   */
  performAppend: (
    target: AppendTargetLike,
    items: CartItem[],
    dailyLimitHoldToken: string,
    opts?: PerformAppendOptions,
  ) => Promise<void>;
}

export function usePosAppend(args: UsePosAppendArgs): UsePosAppendReturn {
  const { branchId, refreshOperational } = args;

  const pendingRef = useRef(false);

  const performAppend = useCallback(
    async (
      target: AppendTargetLike,
      items: CartItem[],
      dailyLimitHoldToken: string,
      opts?: PerformAppendOptions,
    ): Promise<void> => {
      if (pendingRef.current) {
        toast.message("Đang thêm món, vui lòng chờ…");
        return;
      }
      pendingRef.current = true;

      try {
        const key = crypto.randomUUID();
        const result = await appendOrderItems(
          branchId,
          target.orderId,
          items,
          key,
          dailyLimitHoldToken,
        );

        if (!result.success) {
          toast.error(result.error ?? "Không thể thêm món");
          return;
        }

        toast.success(`Đã thêm món vào đơn #${target.orderNumber}`);

        opts?.onSuccess?.();
        void refreshOperational();
      } finally {
        pendingRef.current = false;
      }
    },
    [branchId, refreshOperational],
  );

  return { performAppend };
}
