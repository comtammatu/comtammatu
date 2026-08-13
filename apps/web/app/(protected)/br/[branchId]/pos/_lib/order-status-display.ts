/**
 * Single source for cashier-facing order status labels.
 *
 * UI-display collapse only. DB enum keeps full 6-state lifecycle
 * (new/confirmed/preparing/ready/served/completed/cancelled) — chef KDS +
 * reports + audit need that granularity.
 *
 * Cashier rule of thumb: chỉ show 5 labels.
 *   - active (new/confirmed/preparing) → relative age "X phút" / "X tiếng"
 *   - ready                            → "Sẵn sàng" (floor pickup signal)
 *   - served                           → kitchen `Đã phục vụ` / `success`
 *   - unpaid / pending                 → `order-payment` domain
 *   - paid (any status)                → "Đã thanh toán"
 *   - cancelled                        → "Đã hủy"
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
 * Kitchen `served` stays success; unpaid uses the payment domain at the
 * call site via `getPosOrderStatusInfo`.
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

export function getPosOrderStatusInfo(
  order: OrderStatusInput,
): OrderStatusInfo {
  if (order.status === "cancelled") {
    return {
      label: "Đã hủy",
      variant: getStatusBadgeMeta("order", "cancelled").variant,
    };
  }
  if (order.payment_status === "paid") {
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
      return {
        label: "Sẵn sàng",
        variant: getPosOrderStateVariant("ready"),
      };
    case "served": {
      const kitchen = getStatusBadgeMeta("order", "served");
      if (order.payment_status === "paid") {
        return {
          label: kitchen.label,
          variant: kitchen.variant,
        };
      }
      const payment = getStatusBadgeMeta(
        "order-payment",
        order.payment_status ?? "unpaid",
      );
      return { label: payment.label, variant: payment.variant };
    }
    default:
      return { label: order.status, variant: "outline" };
  }
}
