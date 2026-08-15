"use client";

import { useCallback, useState } from "react";
import type { SessionOrder } from "../order-history";
import type { OrderDetailData } from "../order-detail-sheet";

export interface UseOrderDetailSurfaceArgs {
  /**
   * Collapses the cart drawer. `openDetail` closes the drawer before painting
   * the detail sheet; the drawer state stays orchestrator-owned, so the side
   * effect is injected. Must be referentially stable (the orchestrator's
   * `useState` setter wrapper) to keep `openDetail` stable.
   */
  closeCartDrawer: () => void;
}

export interface UseOrderDetailSurfaceReturn {
  orderDetailId: number | null;
  orderDetailNumber: string | null;
  orderDetailSummary: SessionOrder | null;
  orderDetailSeed: {
    order: OrderDetailData;
    canManage: boolean;
  } | null;
  detailRefreshTick: number;
  /** Open OrderDetailSheet for an order via the list-row tap path. */
  openDetail: (
    id: number,
    orderNumber?: string | null,
    summary?: SessionOrder,
  ) => void;
  /** Close OrderDetailSheet and reset its seed / summary. */
  closeOrderDetail: () => void;
  /** Force OrderDetailSheet to refetch by bumping its refresh token. */
  bumpDetailRefresh: () => void;
  setOrderDetailId: (value: number | null) => void;
  setOrderDetailNumber: (value: string | null) => void;
  setOrderDetailSummary: (value: SessionOrder | null) => void;
  setOrderDetailSeed: (
    value: {
      order: OrderDetailData;
      canManage: boolean;
    } | null,
  ) => void;
}

/**
 * Owns the order-detail surface state cluster for the POS desktop surface:
 * which order OrderDetailSheet targets, its display number, the optional
 * list-row summary + table-tap seed used to paint the sheet header before its
 * own fetch resolves, and the refresh token that forces a refetch.
 *
 * The raw setters are exposed alongside `openDetail`/`closeOrderDetail` because
 * the orchestrator's `focusOrderWorkflow`, table-tap fallback, and the customizer
 * reopen bridge still write them directly. `bumpDetailRefresh` is returned so
 * the orchestrator's broader operational refresh can drive the detail refetch
 * alongside the orders fetch.
 */
export function useOrderDetailSurface(
  args: UseOrderDetailSurfaceArgs,
): UseOrderDetailSurfaceReturn {
  const { closeCartDrawer } = args;

  const [orderDetailId, setOrderDetailId] = useState<number | null>(null);
  const [orderDetailNumber, setOrderDetailNumber] = useState<string | null>(
    null,
  );
  // Lightweight summary handed to OrderDetailSheet so its header (order
  // number, table/takeaway) renders immediately on a list-row tap. Fresh fetch always
  // wins for items + totals; this only fills the gap during the items
  // skeleton phase. Cleared on sheet close + on table-tap (which provides
  // full data via orderDetailSeed instead).
  const [orderDetailSummary, setOrderDetailSummary] =
    useState<SessionOrder | null>(null);
  // Seed for OrderDetailSheet's first render. Populated when the cashier
  // taps an occupied table (`fetchActiveOrderForTable` already returns the
  // full detail + canManage hint) so the sheet can paint items/total
  // without its own fetchOrderDetail round-trip. Null for code paths
  // that only know the orderId (e.g. post-submit `focusOrderWorkflow`,
  // OrderListPane detail open) → sheet falls back to its normal fetch.
  const [orderDetailSeed, setOrderDetailSeed] = useState<{
    order: OrderDetailData;
    canManage: boolean;
  } | null>(null);
  const [detailRefreshTick, setDetailRefreshTick] = useState(0);

  const bumpDetailRefresh = useCallback(() => {
    setDetailRefreshTick((t) => t + 1);
  }, []);

  const openDetail = useCallback(
    (id: number, orderNumber?: string | null, summary?: SessionOrder) => {
      closeCartDrawer();
      // Clear any table-tap seed: this path (OrderListPane row tap) does
      // NOT have the full detail with items, so OrderDetailSheet falls
      // back to its own fetch. The summary, when available, lets the
      // sheet header (order number, table/takeaway) render instantly while items
      // load — saves the 500-1000ms blank-modal flash on slow networks.
      setOrderDetailSeed(null);
      setOrderDetailSummary(summary ?? null);
      setOrderDetailId(id);
      setOrderDetailNumber(orderNumber ?? null);
    },
    [closeCartDrawer],
  );

  const closeOrderDetail = useCallback(() => {
    setOrderDetailId(null);
    setOrderDetailNumber(null);
    setOrderDetailSeed(null);
    setOrderDetailSummary(null);
  }, []);

  return {
    orderDetailId,
    orderDetailNumber,
    orderDetailSummary,
    orderDetailSeed,
    detailRefreshTick,
    openDetail,
    closeOrderDetail,
    bumpDetailRefresh,
    setOrderDetailId,
    setOrderDetailNumber,
    setOrderDetailSummary,
    setOrderDetailSeed,
  };
}
