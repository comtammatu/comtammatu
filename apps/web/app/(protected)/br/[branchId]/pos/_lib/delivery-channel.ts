import { DELIVERY_PLATFORM_LABELS_VI } from "@comtammatu/shared/labels";
import type { MenuItem } from "../pos-menu-types";
import type { DeliveryPlatform, OrderType } from "../types";

export const DELIVERY_PLATFORMS = [
  "grab",
  "shopee",
  "be",
  "green_sm",
] as const satisfies readonly DeliveryPlatform[];

export function getDeliveryPlatformLabel(platform: DeliveryPlatform): string {
  return DELIVERY_PLATFORM_LABELS_VI[platform];
}

export type ResolvedMenuListPrice =
  | { ok: true; unitPrice: number }
  | { ok: false; reason: "platform_required" | "channel_price_missing" };

/** POS menu list price before variant/modifier/side adjustments. */
export function resolvePosMenuListPrice(
  item: Pick<MenuItem, "base_price" | "channel_prices">,
  orderType: OrderType,
  deliveryPlatform: DeliveryPlatform | null | undefined,
): ResolvedMenuListPrice {
  if (orderType !== "delivery") {
    return { ok: true, unitPrice: item.base_price };
  }

  if (deliveryPlatform == null) {
    return { ok: false, reason: "platform_required" };
  }

  const channelPrice = item.channel_prices?.[deliveryPlatform];
  if (channelPrice === undefined) {
    return { ok: false, reason: "channel_price_missing" };
  }

  return { ok: true, unitPrice: channelPrice };
}

const GATE_ORDER_SEQUENCE_RE =
  /^(?:MV|GH)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,4})(?:-.+)?$/i;

export function formatGateOrderTileNumber(orderNumber: string): string {
  const cleaned = orderNumber.trim().replace(/^#+/, "");
  const sequence = GATE_ORDER_SEQUENCE_RE.exec(cleaned)?.[1];
  return `#${sequence ?? cleaned}`;
}
