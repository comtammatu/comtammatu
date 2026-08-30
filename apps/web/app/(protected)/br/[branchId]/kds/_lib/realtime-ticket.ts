import type { KdsTicket } from "../types";

export const KDS_REALTIME_TICKET_COLUMNS = [
  "id",
  "station_id",
  "order_id",
  "order_item_id",
  "kitchen_send_batch_id",
  "status",
  "bumped_at",
  "created_at",
  "updated_at",
] as const;

export const KDS_TICKET_SELECT = KDS_REALTIME_TICKET_COLUMNS.join(", ");

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDatabaseId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parseKdsRealtimeTicket(value: unknown): KdsTicket | null {
  if (!isRecord(value)) return null;
  if (
    !isDatabaseId(value.id) ||
    !isDatabaseId(value.station_id) ||
    !isDatabaseId(value.order_id) ||
    !isDatabaseId(value.order_item_id) ||
    (value.kitchen_send_batch_id !== null &&
      !isDatabaseId(value.kitchen_send_batch_id)) ||
    typeof value.status !== "string" ||
    !isNullableString(value.bumped_at) ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    station_id: value.station_id,
    order_id: value.order_id,
    order_item_id: value.order_item_id,
    kitchen_send_batch_id: value.kitchen_send_batch_id,
    status: value.status,
    bumped_at: value.bumped_at,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

export function parseKdsRealtimeTicketId(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return isDatabaseId(value.id) ? value.id : null;
}
