"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { reserveDailyLimitHolds, releaseDailyLimitHolds } from "../actions";
import type { CartItem } from "../types";
import type { AppendTarget } from "./use-append-target";

type DailyLimitHoldSource = "pos_cart" | "pos_append";

interface DailyLimitHoldSyncState {
  inFlight: boolean;
  queuedItems: CartItem[] | null;
}

export interface UseDailyLimitHoldsArgs {
  branchId: number;
  /** Live cart lines — drives the debounced `pos_cart` hold reservation. */
  cartItems: CartItem[];
  /** Live append-draft lines — drives the debounced `pos_append` reservation. */
  appendDraftItems: CartItem[];
  /**
   * Active append target, or null. When null the `pos_append` debounce reserves
   * an empty snapshot (releases any prior append holds). Passed as the object so
   * the debounce re-runs when the target switches between orders, not only on
   * null transitions.
   */
  appendTarget: AppendTarget | null;
}

export interface UseDailyLimitHoldsReturn {
  /** Lazily mint (and memoize) the per-source hold token. */
  getDailyLimitHoldToken: (source: DailyLimitHoldSource) => string;
  /** Rotate the per-source hold token to a fresh value. */
  resetDailyLimitHoldToken: (source: DailyLimitHoldSource) => void;
  /**
   * Synchronously reserve holds for the given snapshot, surfacing a toast on
   * failure unless `options.showError === false` (or the snapshot is empty).
   */
  reserveDailyLimitSnapshot: (
    items: CartItem[],
    source: DailyLimitHoldSource,
    options?: { showError?: boolean },
  ) => Promise<boolean>;
  /** Release the per-source holds and rotate the token. */
  releaseDailyLimitHoldToken: (source: DailyLimitHoldSource) => void;
}

/**
 * Owns the daily-limit hold-token machinery for the POS desktop surface.
 *
 * Two independent hold sources (`pos_cart`, `pos_append`) each carry a token
 * plus a single-flight sync state. Tokens are minted lazily on first read so a
 * reset between mint and use rotates cleanly. Two 120ms debounced effects keep
 * the server-side holds in step with the live cart / append-draft snapshots.
 *
 * Mirrors `usePosAppend` / `useDailyLimitSync`: refs created once inside the
 * hook, ref-based single-flight to avoid stale closures.
 */
export function useDailyLimitHolds(
  args: UseDailyLimitHoldsArgs,
): UseDailyLimitHoldsReturn {
  const { branchId, cartItems, appendDraftItems, appendTarget } = args;

  const cartHoldTokenRef = useRef<string | null>(null);
  const appendHoldTokenRef = useRef<string | null>(null);
  const cartHoldSyncRef = useRef<DailyLimitHoldSyncState>({
    inFlight: false,
    queuedItems: null,
  });
  const appendHoldSyncRef = useRef<DailyLimitHoldSyncState>({
    inFlight: false,
    queuedItems: null,
  });

  const getDailyLimitHoldToken = useCallback(
    (source: DailyLimitHoldSource): string => {
      const ref = source === "pos_cart" ? cartHoldTokenRef : appendHoldTokenRef;
      ref.current ??= crypto.randomUUID();
      return ref.current;
    },
    [],
  );

  const resetDailyLimitHoldToken = useCallback(
    (source: DailyLimitHoldSource): void => {
      const ref = source === "pos_cart" ? cartHoldTokenRef : appendHoldTokenRef;
      ref.current = crypto.randomUUID();
    },
    [],
  );

  const reserveDailyLimitSnapshot = useCallback(
    async (
      items: CartItem[],
      source: DailyLimitHoldSource,
      options: { showError?: boolean } = {},
    ): Promise<boolean> => {
      const result = await reserveDailyLimitHolds(
        branchId,
        getDailyLimitHoldToken(source),
        items,
        source,
      );

      if (!result.success) {
        if (options.showError !== false && items.length > 0) {
          toast.error(result.error ?? "Không thể giữ suất món.");
        }
        return false;
      }

      return true;
    },
    [branchId, getDailyLimitHoldToken],
  );

  const flushDailyLimitHoldSync = useCallback(
    (source: DailyLimitHoldSource): void => {
      const sync =
        source === "pos_cart"
          ? cartHoldSyncRef.current
          : appendHoldSyncRef.current;
      if (sync.inFlight || sync.queuedItems === null) return;

      sync.inFlight = true;

      void (async () => {
        try {
          while (sync.queuedItems !== null) {
            const items = sync.queuedItems;
            sync.queuedItems = null;
            const holdToken = getDailyLimitHoldToken(source);
            const result = await reserveDailyLimitHolds(
              branchId,
              holdToken,
              items,
              source,
            );

            if (!result.success && items.length > 0) {
              toast.error(result.error ?? "Không thể giữ suất món.");
            }

            const currentToken =
              source === "pos_cart"
                ? cartHoldTokenRef.current
                : appendHoldTokenRef.current;
            if (currentToken !== null && currentToken !== holdToken) {
              void releaseDailyLimitHolds(branchId, holdToken);
            }
          }
        } finally {
          sync.inFlight = false;
        }
      })();
    },
    [branchId, getDailyLimitHoldToken],
  );

  const queueDailyLimitHoldSync = useCallback(
    (source: DailyLimitHoldSource, items: CartItem[]): void => {
      const sync =
        source === "pos_cart"
          ? cartHoldSyncRef.current
          : appendHoldSyncRef.current;
      sync.queuedItems = items;
      flushDailyLimitHoldSync(source);
    },
    [flushDailyLimitHoldSync],
  );

  const releaseDailyLimitHoldToken = useCallback(
    (source: DailyLimitHoldSource): void => {
      const token = getDailyLimitHoldToken(source);
      resetDailyLimitHoldToken(source);
      void releaseDailyLimitHolds(branchId, token);
    },
    [branchId, getDailyLimitHoldToken, resetDailyLimitHoldToken],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      queueDailyLimitHoldSync("pos_cart", cartItems);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [cartItems, queueDailyLimitHoldSync]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      queueDailyLimitHoldSync(
        "pos_append",
        appendTarget == null ? [] : appendDraftItems,
      );
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [appendDraftItems, appendTarget, queueDailyLimitHoldSync]);

  return {
    getDailyLimitHoldToken,
    resetDailyLimitHoldToken,
    reserveDailyLimitSnapshot,
    releaseDailyLimitHoldToken,
  };
}
