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
  /** Clear the shell's append-mode state after a successful or replayed append. */
  clearAppendTarget: () => void;
  /** Open the order-detail sheet on the appended order. */
  focusOrderWorkflow: (orderId: number, orderNumber: string) => void;
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
   *   - success orchestration: toast + clear append-mode + open detail + refresh
   * Safe to call from either tap-direct or customizer-confirm paths.
   */
  performAppend: (
    target: AppendTargetLike,
    items: CartItem[],
    opts?: PerformAppendOptions,
  ) => Promise<void>;
}

export function usePosAppend(args: UsePosAppendArgs): UsePosAppendReturn {
  const {
    branchId,
    clearAppendTarget,
    focusOrderWorkflow,
    refreshOperational,
  } = args;

  const pendingRef = useRef(false);

  const performAppend = useCallback(
    async (
      target: AppendTargetLike,
      items: CartItem[],
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
        );

        if (!result.success) {
          toast.error(result.error ?? "Không thể thêm món");
          return;
        }

        toast.success(`Đã thêm món vào đơn #${target.orderNumber}`);
        const kitchenWarning = result.meta?.kitchenWarning;
        if (typeof kitchenWarning === "string") {
          toast.warning(kitchenWarning);
        }

        clearAppendTarget();
        opts?.onSuccess?.();
        focusOrderWorkflow(target.orderId, target.orderNumber);
        void refreshOperational();
      } finally {
        pendingRef.current = false;
      }
    },
    [branchId, clearAppendTarget, focusOrderWorkflow, refreshOperational],
  );

  return { performAppend };
}
