export type PrintOrderType = "dine_in" | "takeaway" | string;
export type PrintTableNumber = number | string | null | undefined;

const ORDER_SEQUENCE_RE = /^(?:TC|MV)-(?:(?:\d{6}|\d{8})-)?(\d{1,4})(?:-.+)?$/i;

function cleanOrderNumber(orderNumber: string | null | undefined): string {
  return (orderNumber ?? "").trim().replace(/^#+/, "");
}

function normalizeTableNumber(tableNumber: PrintTableNumber): string | null {
  if (tableNumber == null) return null;
  const normalized = String(tableNumber).trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveOrderTypeLabel(
  orderNumber: string,
  orderType: PrintOrderType | null | undefined,
  tableNumber: PrintTableNumber,
): string {
  const prefix = orderNumber.split("-")[0]?.toUpperCase();
  const tableLabel = normalizeTableNumber(tableNumber);
  const normalizedOrderType = orderType ?? "";
  const isDineIn =
    normalizedOrderType === "dine_in" ||
    (normalizedOrderType !== "takeaway" && prefix === "TC");
  if (isDineIn && tableLabel) return `Bàn ${tableLabel}`;
  if (isDineIn) return "Tại bàn";
  if (normalizedOrderType === "takeaway") return "Mang về";
  if (prefix === "MV") return "Mang về";
  return "Đơn";
}

export function extractOrderSequence(
  orderNumber: string | null | undefined,
): string | null {
  const cleaned = cleanOrderNumber(orderNumber);
  const match = ORDER_SEQUENCE_RE.exec(cleaned);
  return match?.[1] ?? null;
}

export function formatOrderHeaderLabel(input: {
  orderNumber: string | null | undefined;
  orderType: PrintOrderType | null | undefined;
  tableNumber?: PrintTableNumber;
}): string {
  const cleaned = cleanOrderNumber(input.orderNumber);
  const label = resolveOrderTypeLabel(
    cleaned,
    input.orderType,
    input.tableNumber,
  );
  const sequence = extractOrderSequence(cleaned);
  if (sequence) return `${label} #${sequence}`;
  if (cleaned) return `${label} ${cleaned}`;
  return label;
}
