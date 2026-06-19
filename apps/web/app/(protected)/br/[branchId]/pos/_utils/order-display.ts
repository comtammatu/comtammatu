import type { SessionOrder } from "../order-history";

const ORDER_SEQUENCE_RE = /^(?:TC|MV)-(?:(?:\d{6}|\d{8})-)?(\d{1,4})(?:-.+)?$/i;

export function formatCompactOrderNumber(orderNumber: string): string {
  const cleaned = orderNumber.trim().replace(/^#+/, "");
  const sequence = ORDER_SEQUENCE_RE.exec(cleaned)?.[1];
  return `#${sequence ?? cleaned}`;
}

export function formatOrderTargetLabel(
  orderNumber: string,
  summary?: Pick<SessionOrder, "order_type" | "tables"> | null,
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

  return compactOrderNumber;
}
