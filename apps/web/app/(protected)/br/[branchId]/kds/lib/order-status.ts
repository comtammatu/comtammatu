import type { KdsOrder } from "../types";

export type KdsDisplayStatus = "pending" | "ready" | "cancelled";

export function isKdsActiveTicketStatus(status: string): boolean {
  return status === "pending" || status === "preparing";
}

export function getKdsTicketDisplayStatus(status: string): KdsDisplayStatus {
  if (status === "ready") return "ready";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

export function getKdsOrderDisplayStatus(
  order: Pick<KdsOrder, "tickets">,
): KdsDisplayStatus {
  const statuses = order.tickets.map((ticket) => ticket.status);

  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "cancelled")
  ) {
    return "cancelled";
  }

  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "ready" || status === "cancelled")
  ) {
    return "ready";
  }

  if (statuses.some(isKdsActiveTicketStatus)) return "pending";
  if (statuses.some((status) => status === "ready")) return "ready";
  return "pending";
}
