import { isKdsActiveTicketStatus } from "./order-status";
import { isKdsComCategory } from "./order-columns";
import type { KdsOrder } from "../types";

export interface KdsBatchSummaryItem {
  itemName: string;
  totalQuantity: number;
  isComCategory: boolean;
}

export function aggregateKdsBatchSummary(
  orders: readonly KdsOrder[],
): KdsBatchSummaryItem[] {
  const itemMap = new Map<string, KdsBatchSummaryItem>();

  for (const order of orders) {
    const activeTicketItemIds = new Set(
      order.tickets
        .filter((ticket) => isKdsActiveTicketStatus(ticket.status))
        .map((ticket) => ticket.order_item_id),
    );

    for (const item of order.items) {
      if (!activeTicketItemIds.has(item.id)) continue;

      const quantity = item.quantity ?? 1;
      const isComCategory = isKdsComCategory(item);
      const current = itemMap.get(item.item_name);
      if (current) {
        current.totalQuantity += quantity;
        current.isComCategory = current.isComCategory || isComCategory;
        continue;
      }

      itemMap.set(item.item_name, {
        itemName: item.item_name,
        totalQuantity: quantity,
        isComCategory,
      });
    }
  }

  return [...itemMap.values()].sort(compareKdsBatchSummaryItems);
}

function compareKdsBatchSummaryItems(
  left: KdsBatchSummaryItem,
  right: KdsBatchSummaryItem,
): number {
  if (left.isComCategory !== right.isComCategory) {
    return left.isComCategory ? -1 : 1;
  }
  if (left.totalQuantity !== right.totalQuantity) {
    return right.totalQuantity - left.totalQuantity;
  }
  return left.itemName.localeCompare(right.itemName, "vi");
}
