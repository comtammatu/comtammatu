import type { KdsOrder } from "../types";

export type KdsDisplayStatus = "pending" | "preparing" | "ready" | "cancelled";

export function getKdsOrderDisplayStatus(
  order: Pick<KdsOrder, "tickets">,
  options: { isCurrent?: boolean } = {},
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

  const hasActiveWork = statuses.some(
    (status) => status === "pending" || status === "preparing",
  );
  if (options.isCurrent === true && hasActiveWork) return "preparing";
  if (statuses.some((status) => status === "preparing")) return "preparing";
  if (statuses.some((status) => status === "pending")) return "pending";
  if (statuses.some((status) => status === "ready")) return "ready";
  return "pending";
}
