import type { KdsTicket } from "../types";

export const KDS_ACTIVE_STATUSES = ["pending", "preparing"] as const;
export const KDS_DONE_STATUSES = ["ready"] as const;
export const KDS_VISIBLE_STATUSES = [
  ...KDS_ACTIVE_STATUSES,
  ...KDS_DONE_STATUSES,
] as const;

const KDS_ACTIVE_STATUS_SET = new Set<string>(KDS_ACTIVE_STATUSES);
const KDS_DONE_STATUS_SET = new Set<string>(KDS_DONE_STATUSES);
const KDS_VISIBLE_STATUS_SET = new Set<string>(KDS_VISIBLE_STATUSES);

export function isKdsActiveTicketStatus(status: string): boolean {
  return KDS_ACTIVE_STATUS_SET.has(status);
}

export function isKdsDoneTicketStatus(status: string): boolean {
  return KDS_DONE_STATUS_SET.has(status);
}

export function isKdsVisibleTicketStatus(status: string): boolean {
  return KDS_VISIBLE_STATUS_SET.has(status);
}

export function orderHasKitchenWork(
  tickets: readonly Pick<KdsTicket, "status">[],
): boolean {
  return tickets.some((ticket) => isKdsActiveTicketStatus(ticket.status));
}

export function orderIsKitchenDone(
  tickets: readonly Pick<KdsTicket, "status">[],
): boolean {
  return (
    tickets.length > 0 &&
    tickets.every((ticket) => isKdsDoneTicketStatus(ticket.status))
  );
}

export function getTicketDoneAtMs(
  ticket: Pick<KdsTicket, "bumped_at" | "updated_at" | "created_at">,
): number {
  const value = ticket.bumped_at ?? ticket.updated_at ?? ticket.created_at;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareKdsDoneOrdersDesc(
  a: { groupKey: string; tickets: readonly KdsTicket[] },
  b: { groupKey: string; tickets: readonly KdsTicket[] },
): number {
  const aDoneAt = Math.max(0, ...a.tickets.map(getTicketDoneAtMs));
  const bDoneAt = Math.max(0, ...b.tickets.map(getTicketDoneAtMs));
  const timeDelta = bDoneAt - aDoneAt;
  if (timeDelta !== 0) return timeDelta;
  return a.groupKey.localeCompare(b.groupKey);
}
