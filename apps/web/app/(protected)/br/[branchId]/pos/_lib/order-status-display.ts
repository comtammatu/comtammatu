/**
 * Single source for cashier-facing order status labels.
 *
 * UI-display collapse only. DB enum keeps full 6-state lifecycle
 * (new/confirmed/preparing/ready/served/completed/cancelled) — chef KDS +
 * reports + audit need that granularity.
 *
 * Cashier rule of thumb: chỉ show 4 labels.
 *   - active (new/confirmed/preparing) → relative age "X phút" / "X tiếng"
 *   - ready / served (kitchen done)    → `order-payment` domain while unpaid
 *   - paid (any status)                → "Đã thanh toán"
 *   - cancelled                        → "Đã hủy"
 *
 * Kitchen complete (`ready`) already means food left the pass — POS does not
 * expose a separate waiter `served` confirmation or "Đã phục vụ" badge.
 *
 * NEVER expose this to KDS chef view, admin reports, or audit trail —
 * those keep full granularity by design.
 */

import { getStatusBadgeMeta } from "@/components/status-badge";
import type { BadgeProps } from "@comtammatu/ui/components/badge";
import type { PosTableOrderVisualState } from "./table-order-visual-state";

type OrderStatusVariant = NonNullable<BadgeProps["variant"]>;

export interface OrderStatusInfo {
  label: string;
  variant: OrderStatusVariant;
}

/**
 * Canonical workflow-state -> badge variant for active/unpaid POS orders.
 * One order = one color across the table tile and the order-list badge:
 * the tile derives its tone from this same map instead of re-deriving tone.
 * Kitchen-done (`ready`/`served`) collapses to dining `served` tone; unpaid
 * uses the payment domain at the call site via `getPosOrderStatusInfo`.
 */
type PosOrderStateVariant = Extract<
  OrderStatusVariant,
  "default" | "success" | "warning"
>;

const POS_ORDER_STATE_VARIANT: Record<
  PosTableOrderVisualState,
  PosOrderStateVariant
> = {
  active: "default",
  ready: "success",
  served: "success",
};

export function getPosOrderStateVariant(
  state: PosTableOrderVisualState,
): PosOrderStateVariant {
  return POS_ORDER_STATE_VARIANT[state];
}

export interface OrderStatusInput {
  status: string;
  payment_status: string | null;
  created_at: string;
}

/** Vietnamese age string. < 1 phút = "vừa tạo", < 60 phút = "X phút",
 * >= 60 phút = "X tiếng". Stale across renders unless the parent re-renders;
 * acceptable for the order list which refreshes on realtime / refetch. */
function formatOrderAge(createdAtIso: string): string {
  const elapsedMs = Date.now() - new Date(createdAtIso).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "vừa tạo";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  return `${hours} tiếng`;
}

function getUnpaidKitchenDoneStatusInfo(
  paymentStatus: string | null,
): OrderStatusInfo {
  const payment = getStatusBadgeMeta(
    "order-payment",
    paymentStatus ?? "unpaid",
  );
  return { label: payment.label, variant: payment.variant };
}

export function getPosOrderStatusInfo(
  order: OrderStatusInput,
): OrderStatusInfo {
  if (order.status === "cancelled") {
    return {
      label: "Đã hủy",
      variant: getStatusBadgeMeta("order", "cancelled").variant,
    };
  }
  if (order.payment_status === "paid" || order.status === "completed") {
    return {
      label: "Đã thanh toán",
      variant: getStatusBadgeMeta("order-payment", "paid").variant,
    };
  }
  switch (order.status) {
    case "new":
    case "confirmed":
    case "preparing":
      return {
        label: formatOrderAge(order.created_at),
        variant: getPosOrderStateVariant("active"),
      };
    case "ready":
    case "served":
      return getUnpaidKitchenDoneStatusInfo(order.payment_status);
    default:
      return { label: order.status, variant: "outline" };
  }
}

/** Archived / completed list: paid vs cancelled only — never kitchen age. */
export function getPosCompletedOrderStatusInfo(
  order: OrderStatusInput,
): OrderStatusInfo {
  if (order.status === "cancelled") {
    return {
      label: "Đã hủy",
      variant: getStatusBadgeMeta("order", "cancelled").variant,
    };
  }
  return {
    label: "Đã thanh toán",
    variant: getStatusBadgeMeta("order-payment", "paid").variant,
  };
}
