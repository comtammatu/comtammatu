"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
  type SessionOrder,
} from "../order-history";
import type {
  BillReceiptIntent,
  OrderData,
} from "../_components/bill/bill-receipt-types";

function isOrderAwaitingPayment(order: {
  status: string;
  payment_status: string | null;
}) {
  return (
    ACTIVE_POS_STATUSES.includes(order.status) &&
    order.payment_status !== "paid"
  );
}

export interface UseBillSurfaceArgs {
  /**
   * Live session orders. Passed by reference (the orchestrator's `usePosOrders`
   * snapshot) so `billHeaderSeed`, `latestAwaitingPaymentOrderId`, and the
   * post-submit auto-clear effect fire on identical triggers.
   */
  orders: SessionOrder[];
  /**
   * Closes the cart drawer. `openBill` collapses the drawer before painting the
   * bill surface; the drawer state stays orchestrator-owned, so the side effect
   * is injected. Must be referentially stable (the orchestrator's `useState`
   * setter) to keep `openBill` stable.
   */
  closeCartDrawer: () => void;
}

export interface UseBillSurfaceReturn {
  billOrderId: number | null;
  billIntent: BillReceiptIntent;
  billInitialOrder: OrderData | null;
  /** Header-only seed derived from `orders` for the active bill order. */
  billHeaderSeed: SessionOrder | null;
  /** Single source for the F9 hotkey + mobile pay-quick-tap. */
  latestAwaitingPaymentOrderId: number | null;
  /** Open the bill surface for an order (clears the post-submit prompt). */
  openBill: (id: number, intent?: BillReceiptIntent, seed?: OrderData) => void;
  /** Close the bill surface and reset intent / seed. */
  closeBill: () => void;
  setBillOrderId: (value: number | null) => void;
  setBillIntent: (value: BillReceiptIntent) => void;
  setBillInitialOrder: (value: OrderData | null) => void;
  setPostSubmitPaymentOrderId: (value: number | null) => void;
}

/**
 * Owns the bill-surface state cluster for the POS desktop surface: which order
 * the BillReceipt dialog targets, its intent (payment vs receipt), the optional
 * detail-path seed, and the post-submit payment prompt id.
 *
 * The raw setters are exposed alongside `openBill`/`closeBill` because the
 * orchestrator's `handlePayOrderFromPicker` and `handleSubmitOrder` paths still
 * write them directly (toast action).
 */
export function useBillSurface(args: UseBillSurfaceArgs): UseBillSurfaceReturn {
  const { orders, closeCartDrawer } = args;

  const [billOrderId, setBillOrderId] = useState<number | null>(null);
  const [billIntent, setBillIntent] = useState<BillReceiptIntent>("payment");
  const [postSubmitPaymentOrderId, setPostSubmitPaymentOrderId] = useState<
    number | null
  >(null);
  // Seed passed to BillReceipt when we just came from OrderDetailSheet
  // on the same order — lets BillReceipt skip its own fetch. Null for
  // bill opens from any other path (toast action, order-list direct
  // open) so BillReceipt falls back to fetchOrderForBill(orderId).
  const [billInitialOrder, setBillInitialOrder] = useState<OrderData | null>(
    null,
  );
  // Header-only seed for non-detail bill paths (F9 / list / picker /
  // post-submit toast). `usePosOrders()` already holds a `SessionOrder`
  // snapshot — derive instead of adding state. BillReceipt paints the dialog
  // title (order number + total) immediately; the full bill fetch runs behind.
  const billHeaderSeed = useMemo<SessionOrder | null>(
    () =>
      billOrderId !== null
        ? (orders.find((order) => order.id === billOrderId) ?? null)
        : null,
    [billOrderId, orders],
  );

  const openBill = useCallback(
    (id: number, intent: BillReceiptIntent = "payment", seed?: OrderData) => {
      closeCartDrawer();
      setPostSubmitPaymentOrderId(null);
      setBillIntent(intent);
      setBillInitialOrder(seed ?? null);
      setBillOrderId(id);
    },
    [closeCartDrawer],
  );

  const closeBill = useCallback(() => {
    setBillOrderId(null);
    setBillIntent("payment");
    setBillInitialOrder(null);
  }, []);

  // Single source for F9 hotkey + mobile pay-quick-tap. Memoized so the
  // boolean prop fed to PosMobileActionBar doesn't flip identity on every
  // realtime tick where orders changed but the awaiting slice did not.
  const latestAwaitingPaymentOrderId = useMemo<number | null>(() => {
    if (postSubmitPaymentOrderId !== null) return postSubmitPaymentOrderId;

    const awaiting = orders
      .filter(isOrderAwaitingPayment)
      .sort(compareOrdersByNextAction)[0];
    return awaiting?.id ?? null;
  }, [orders, postSubmitPaymentOrderId]);

  useEffect(() => {
    if (postSubmitPaymentOrderId === null) return;

    const promptOrder = orders.find(
      (order) => order.id === postSubmitPaymentOrderId,
    );
    if (promptOrder && !isOrderAwaitingPayment(promptOrder)) {
      setPostSubmitPaymentOrderId(null);
    }
  }, [orders, postSubmitPaymentOrderId]);

  return {
    billOrderId,
    billIntent,
    billInitialOrder,
    billHeaderSeed,
    latestAwaitingPaymentOrderId,
    openBill,
    closeBill,
    setBillOrderId,
    setBillIntent,
    setBillInitialOrder,
    setPostSubmitPaymentOrderId,
  };
}
