import { shopeeKitchenCallRef } from "@comtammatu/shared/delivery";
import { getDeliveryPlatformLabelVi } from "@comtammatu/shared/labels";
import type { SessionOrder } from "../order-history";

const ORDER_SEQUENCE_RE =
  /^(?:TC|MV|GH)-(?:(?:\d{6}|\d{8})-)?(\d{1,4})(?:-.+)?$/i;

export function formatCompactOrderNumber(orderNumber: string): string {
  const cleaned = orderNumber.trim().replace(/^#+/, "");
  const sequence = ORDER_SEQUENCE_RE.exec(cleaned)?.[1];
  return `#${sequence ?? cleaned}`;
}

export function formatOrderTargetLabel(
  orderNumber: string,
  summary?: Pick<
    SessionOrder,
    "order_type" | "tables" | "delivery_platform" | "external_order_ref"
  > | null,
): string {
  const compactOrderNumber = formatCompactOrderNumber(orderNumber);

  if (summary?.order_type === "dine_in") {
    const tableNumber = summary.tables?.number;
    return tableNumber != null
      ? `Bàn ${String(tableNumber)} · ${compactOrderNumber}`
      : compactOrderNumber;
  }

  if (summary?.order_type === "takeaway") {
    return `Mang về ${compactOrderNumber}`;
  }

  if (summary?.order_type === "delivery") {
    const platform = getDeliveryPlatformLabelVi(summary.delivery_platform);
    const appRef =
      shopeeKitchenCallRef(summary.external_order_ref?.trim() ?? "") ??
      summary.external_order_ref?.trim();
    const parts = [`Giao hàng ${compactOrderNumber}`];
    if (platform) parts.push(platform);
    if (appRef) parts.push(appRef);
    return parts.join(" · ");
  }

  return compactOrderNumber;
}
