import type { SignalTone } from "@lib/audio-signal";
import type { KdsKitchenSendBatch, KdsOrderItem, KdsTicket } from "../types";
import { isKdsAddOnItem } from "./order-columns";
import { isKdsActiveTicketStatus } from "./order-status";

export type KdsNewTicketSignalTone = Extract<
  SignalTone,
  "kds-new" | "kds-append" | "kds-add-on"
>;

type KdsNewTicketAlertTicket = Pick<
  KdsTicket,
  "id" | "order_id" | "order_item_id" | "kitchen_send_batch_id" | "status"
>;

type KdsNewTicketAlertItem = Pick<
  KdsOrderItem,
  "category_name" | "category_type"
>;

export interface KdsNewTicketAlertGroup {
  groupKey: string;
  ticket: KdsNewTicketAlertTicket;
  ticketIds: number[];
  tone: KdsNewTicketSignalTone;
}

const KDS_SIGNAL_PRIORITY: Record<KdsNewTicketSignalTone, number> = {
  "kds-new": 0,
  "kds-append": 1,
  "kds-add-on": 2,
};

export function getKdsNewTicketSignalTone(args: {
  ticket: Pick<KdsTicket, "kitchen_send_batch_id">;
  item: Pick<KdsOrderItem, "category_name" | "category_type"> | undefined;
  kitchenBatches: ReadonlyMap<number, KdsKitchenSendBatch>;
}): KdsNewTicketSignalTone {
  if (isKdsAddOnItem(args.item)) return "kds-add-on";

  const batchId = args.ticket.kitchen_send_batch_id;
  const batchKind =
    batchId === null ? null : (args.kitchenBatches.get(batchId)?.kind ?? null);
  if (batchKind === "append") return "kds-append";

  return "kds-new";
}

export function hasKdsNewTicketSignalMetadata(args: {
  ticket: Pick<KdsTicket, "kitchen_send_batch_id">;
  item: Pick<KdsOrderItem, "category_name" | "category_type"> | undefined;
  kitchenBatches: ReadonlyMap<number, KdsKitchenSendBatch>;
}): boolean {
  if (args.item === undefined) return false;
  const batchId = args.ticket.kitchen_send_batch_id;
  return batchId === null || args.kitchenBatches.has(batchId);
}

export function getKdsNewTicketToastTitle(
  tone: KdsNewTicketSignalTone,
): string {
  if (tone === "kds-add-on") return "Món thêm mới";
  if (tone === "kds-append") return "Phiếu gọi thêm mới";
  return "Phiếu bếp mới";
}

export function pickHigherPriorityKdsSignalTone(
  current: KdsNewTicketSignalTone | null,
  next: KdsNewTicketSignalTone,
): KdsNewTicketSignalTone {
  if (current === null) return next;
  return KDS_SIGNAL_PRIORITY[next] > KDS_SIGNAL_PRIORITY[current]
    ? next
    : current;
}

export function getKdsNewTicketAlertGroupKey(
  ticket: Pick<KdsTicket, "order_id" | "kitchen_send_batch_id">,
): string {
  if (ticket.kitchen_send_batch_id !== null) {
    return `batch:${String(ticket.kitchen_send_batch_id)}`;
  }
  return `order:${String(ticket.order_id)}`;
}

function isActiveKdsNewTicketAlert(ticket: Pick<KdsTicket, "status">): boolean {
  return isKdsActiveTicketStatus(ticket.status);
}

export function collectReadyKdsNewTicketAlertGroups(args: {
  tickets: readonly KdsNewTicketAlertTicket[];
  pendingTicketIds: ReadonlySet<number>;
  orderItemById: ReadonlyMap<number, KdsNewTicketAlertItem>;
  kitchenBatches: ReadonlyMap<number, KdsKitchenSendBatch>;
}): KdsNewTicketAlertGroup[] {
  const pendingGroups = new Map<string, KdsNewTicketAlertTicket[]>();

  for (const ticket of args.tickets) {
    if (
      !args.pendingTicketIds.has(ticket.id) ||
      !isActiveKdsNewTicketAlert(ticket)
    ) {
      continue;
    }
    const groupKey = getKdsNewTicketAlertGroupKey(ticket);
    const group = pendingGroups.get(groupKey) ?? [];
    group.push(ticket);
    pendingGroups.set(groupKey, group);
  }

  const readyGroups: KdsNewTicketAlertGroup[] = [];

  for (const [groupKey, groupTickets] of pendingGroups) {
    let tone: KdsNewTicketSignalTone | null = null;
    let isReady = true;

    for (const ticket of groupTickets) {
      const item = args.orderItemById.get(ticket.order_item_id);
      if (
        !hasKdsNewTicketSignalMetadata({
          ticket,
          item,
          kitchenBatches: args.kitchenBatches,
        })
      ) {
        isReady = false;
        break;
      }

      const ticketTone = getKdsNewTicketSignalTone({
        ticket,
        item,
        kitchenBatches: args.kitchenBatches,
      });
      tone = pickHigherPriorityKdsSignalTone(tone, ticketTone);
    }

    const firstTicket = groupTickets[0];
    if (!isReady || tone === null || firstTicket === undefined) continue;

    readyGroups.push({
      groupKey,
      ticket: firstTicket,
      ticketIds: groupTickets.map((ticket) => ticket.id),
      tone,
    });
  }

  return readyGroups;
}
