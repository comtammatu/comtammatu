export type PrintOrderType = "dine_in" | "takeaway" | "delivery" | string;
export type PrintTableNumber = number | string | null | undefined;
export type PrintDeliveryPlatform =
  | "grab"
  | "shopee"
  | "be"
  | "green_sm"
  | string;

const ORDER_SEQUENCE_RE =
  /^(?:TC|MV|GH)-(?:(?:\d{6}|\d{8})-)?(\d{1,4})(?:-.+)?$/i;

function cleanOrderNumber(orderNumber: string | null | undefined): string {
  return (orderNumber ?? "").trim().replace(/^#+/, "");
}

function normalizeTableNumber(tableNumber: PrintTableNumber): string | null {
  if (tableNumber == null) return null;
  const normalized = String(tableNumber).trim();
  return normalized.length > 0 ? normalized : null;
}

function formatDeliveryPlatformPrintToken(
  platform: PrintDeliveryPlatform | null | undefined,
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
    (normalizedOrderType !== "takeaway" &&
      normalizedOrderType !== "delivery" &&
      prefix === "TC");
  if (isDineIn && tableLabel) return `Bàn ${tableLabel}`;
  if (isDineIn) return "Tại bàn";
  if (normalizedOrderType === "delivery" || prefix === "GH") {
    return "Giao hàng";
  }
  if (normalizedOrderType === "takeaway" || prefix === "MV") {
    return "Mang về";
  }
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
  deliveryPlatform?: PrintDeliveryPlatform | null;
  externalOrderRef?: string | null;
}): string {
  const cleaned = cleanOrderNumber(input.orderNumber);
  const prefix = cleaned.split("-")[0]?.toUpperCase() ?? "";
  const normalizedOrderType = input.orderType ?? "";
  const isDelivery = normalizedOrderType === "delivery" || prefix === "GH";

  if (isDelivery) {
    const platformToken = formatDeliveryPlatformPrintToken(
      input.deliveryPlatform,
    );
    const externalRef = (input.externalOrderRef ?? "").trim();
    if (externalRef !== "") {
      return `${platformToken}\n${externalRef}`;
    }
    const sequence = extractOrderSequence(cleaned);
    if (sequence) {
      return `${platformToken}\n#${sequence}`;
    }
    if (cleaned !== "") {
      return `${platformToken}\n${cleaned}`;
    }
    return platformToken;
  }

  const label = resolveOrderTypeLabel(
    cleaned,
    input.orderType,
    input.tableNumber,
  );
  const sequence = extractOrderSequence(cleaned);

  if (sequence) {
    return `${label} #${sequence}`;
  } else if (cleaned) {
    return `${label} ${cleaned}`;
  }
  return label;
}
