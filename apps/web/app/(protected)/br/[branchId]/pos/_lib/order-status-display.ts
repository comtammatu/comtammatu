/**
 * Single source for cashier-facing order status labels.
 *
 * Per 4-agent debate (synthesis 2026-04-26): UI-display collapse only.
 * DB enum keeps full 6-state lifecycle (new/confirmed/preparing/ready/served/
 * completed/cancelled) — chef KDS + reports + audit need that granularity.
 *
 * Cashier rule of thumb: chỉ show 5 labels.
 *   - active (new/confirmed/preparing) → relative age "X phút" / "X tiếng"
 *   - ready                            → "Sẵn sàng" (waiter pickup signal)
 *   - served                           → "Đã phục vụ"
 *   - paid (any status)                → "Đã thanh toán"
 *   - cancelled                        → "Đã hủy"
 *
 * NEVER expose this to KDS chef view, admin reports, or audit trail —
 * those keep full granularity by design.
 */

import { getStatusBadgeMeta } from "@/components/status-badge";
import type { BadgeProps } from "@comtammatu/ui/components/badge";

export type OrderStatusVariant = NonNullable<BadgeProps["variant"]>;

export interface OrderStatusInfo {
  label: string;
  variant: OrderStatusVariant;
}

export interface OrderStatusInput {
  status: string;
  payment_status: string | null;
  created_at: string;
}

/** Vietnamese age string. < 1 phút = "vừa tạo", < 60 phút = "X phút",
 * >= 60 phút = "X tiếng". Stale across renders unless the parent re-renders;
 * acceptable for the order list which refreshes on realtime / refetch. */
export function formatOrderAge(createdAtIso: string): string {
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
      return { label: formatOrderAge(order.created_at), variant: "default" };
    case "ready":
      return {
        label: "Sẵn sàng",
        variant: getStatusBadgeMeta("order", "ready").variant,
      };
    case "served":
      return {
        label: "Đã phục vụ",
        variant: getStatusBadgeMeta("order", "served").variant,
      };
    default:
      return { label: order.status, variant: "outline" };
  }
}
