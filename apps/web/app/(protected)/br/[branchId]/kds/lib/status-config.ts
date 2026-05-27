export const STATUS_CONFIG = {
  pending: { label: "Chờ", variant: "warning" as const },
  preparing: { label: "Đang chuẩn bị", variant: "warning" as const },
  ready: { label: "Sẵn sàng", variant: "success" as const },
  cancelled: { label: "Đã hủy", variant: "destructive" as const },
} as const;

export type StatusVariant = "warning" | "success" | "destructive";

export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label ?? status;
}

export function getStatusVariant(status: string): StatusVariant {
  return (
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.variant ?? "warning"
  );
}

export function shouldShowTicketStatusBadge(status: string): boolean {
  return status !== "pending" && status !== "preparing";
}

export const ORDER_TYPE_CONFIG: Record<string, { label: string }> = {
  dine_in: { label: "Tại bàn" },
  takeaway: { label: "Mang về" },
};

export function getOrderTypeLabel(orderType: string): string {
  return ORDER_TYPE_CONFIG[orderType]?.label ?? orderType;
}

export function shouldShowOrderTypeBadge(
  orderType: string,
  tableNumber: number | null,
): boolean {
  return orderType !== "dine_in" || tableNumber === null;
}

export function formatKitchenTicketDisplay(ticketNumber: string): string {
  const trimmed = ticketNumber.trim();
  const orderBasedTicket = formatOrderBasedKitchenTicketDisplay(trimmed);
  if (orderBasedTicket) return orderBasedTicket;

  const suffix = extractReadableSequence(trimmed);
  return suffix ? `#${formatReadableSequence(suffix)}` : trimmed;
}

function formatOrderBasedKitchenTicketDisplay(
  value: string | null | undefined,
) {
  const normalized = (value ?? "").trim().replace(/^#+/, "");
  if (!/^\d{1,5}(?:-\d{1,3})?$/.test(normalized)) return null;
  return `#${normalized}`;
}

function extractReadableSequence(value: string | null | undefined) {
  const parts = (value ?? "")
    .trim()
    .split(/[-_#\s]+/)
    .filter(Boolean);

  const reversedParts = [...parts].reverse();
  const shortSequence = reversedParts.find((part) => /^\d{1,5}$/.test(part));
  if (shortSequence) return shortSequence;

  return reversedParts.find((part) => /^\d{6}$/.test(part)) ?? null;
}

function formatReadableSequence(sequence: string): string {
  const normalized = Number(sequence);
  if (!Number.isSafeInteger(normalized)) return sequence;
  return String(normalized);
}

export function formatKdsTicketSequenceDisplay(
  kitchenTicketNumber: string,
  orderNumber?: string,
): string {
  const orderBasedTicket =
    formatOrderBasedKitchenTicketDisplay(kitchenTicketNumber);
  if (orderBasedTicket) return orderBasedTicket;

  const ticketSequence = extractReadableSequence(kitchenTicketNumber);
  const orderSequence = extractReadableSequence(orderNumber);
  const sequence = ticketSequence ?? orderSequence;

  return sequence
    ? `#${formatReadableSequence(sequence)}`
    : formatKitchenTicketDisplay(kitchenTicketNumber ?? orderNumber);
}

export interface KdsTicketSequenceSortKey {
  primary: number;
  secondary: number;
}

export function getKdsTicketSequenceSortKey(
  kitchenTicketNumber: string | null | undefined,
  orderNumber?: string | null,
): KdsTicketSequenceSortKey | null {
  const orderBasedTicket =
    extractOrderBasedSequenceSortKey(kitchenTicketNumber);
  if (orderBasedTicket) return orderBasedTicket;

  const ticketSequence = extractReadableSequence(kitchenTicketNumber);
  const orderSequence = extractReadableSequence(orderNumber);
  const sequence = ticketSequence ?? orderSequence;
  if (!sequence) return null;

  const primary = Number(sequence);
  if (!Number.isSafeInteger(primary)) return null;
  return { primary, secondary: 0 };
}

function extractOrderBasedSequenceSortKey(
  value: string | null | undefined,
): KdsTicketSequenceSortKey | null {
  const normalized = (value ?? "").trim().replace(/^#+/, "");
  if (!/^\d{1,5}(?:-\d{1,3})?$/.test(normalized)) return null;

  const [primaryRaw, secondaryRaw] = normalized.split("-");
  const primary = Number(primaryRaw);
  const secondary = secondaryRaw === undefined ? 0 : Number(secondaryRaw);
  if (!Number.isSafeInteger(primary) || !Number.isSafeInteger(secondary)) {
    return null;
  }
  return { primary, secondary };
}
