import { ORDER_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import { getKdsTicketDisplayStatus } from "./order-status";

export function shouldShowTicketStatusBadge(status: string): boolean {
  return getKdsTicketDisplayStatus(status) !== "pending";
}

const ORDER_TYPE_CONFIG: Record<string, { label: string }> = {
  dine_in: { label: ORDER_TYPE_LABELS_VI.dine_in },
  takeaway: { label: ORDER_TYPE_LABELS_VI.takeaway },
};

export function getOrderTypeLabel(orderType: string): string {
  return ORDER_TYPE_CONFIG[orderType]?.label ?? orderType;
}

function formatKitchenTicketDisplay(ticketNumber: string): string {
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
