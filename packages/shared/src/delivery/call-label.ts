import { shopeeKitchenCallRef } from "./shopee-order-ref";

export type DeliveryPlatform = "grab" | "shopee" | "be" | "green_sm";

const ORDER_SEQUENCE_RE =
  /^(?:TC|MV|GH)-(?:(?:\d{6}|\d{8})-)?(\d{1,4})(?:-.+)?$/i;

function cleanOrderNumber(orderNumber: string | null | undefined): string {
  return (orderNumber ?? "").trim().replace(/^#+/, "");
}

export function extractDeliveryOrderSequence(
  orderNumber: string | null | undefined,
): string | null {
  const match = ORDER_SEQUENCE_RE.exec(cleanOrderNumber(orderNumber));
  return match?.[1] ?? null;
}

export function formatDeliveryPlatformPrintToken(
  platform: DeliveryPlatform | string | null | undefined,
): string {
  switch (platform) {
    case "grab":
      return "GRAB";
    case "shopee":
      return "SHOPEEFOOD";
    case "be":
      return "BEFOOD";
    case "green_sm":
      return "GREEN SM";
    default:
      return platform ? platform.toUpperCase() : "GIAO HANG";
  }
}

export function formatDeliveryCallLabel(input: {
  orderNumber: string | null | undefined;
  externalOrderRef?: string | null | undefined;
  deliveryPlatform?: DeliveryPlatform | string | null | undefined;
}): string {
  const externalRef = (input.externalOrderRef ?? "").trim();
  if (externalRef.length > 0) {
    return shopeeKitchenCallRef(externalRef) ?? externalRef;
  }

  const sequence = extractDeliveryOrderSequence(input.orderNumber);
  if (sequence) {
    return `Giao hàng #${sequence}`;
  }

  const cleaned = cleanOrderNumber(input.orderNumber);
  if (cleaned) {
    return `Giao hàng ${cleaned}`;
  }

  return "Giao hàng";
}

