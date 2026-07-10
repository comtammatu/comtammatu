import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { SelfOrderCartItem, SelfOrderMenuItem } from "./contracts";

export type SelfOrderAvailability = {
  is_disabled: boolean;
  available_to_sell: number | null;
  manual_limit_quantity: number | null;
};

export function remainingAfterDemand(
  availability: SelfOrderAvailability | null | undefined,
  draftDemand: number,
): number | null {
  if (!availability) return null;
  const value = availability.available_to_sell;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value - draftDemand);
}

export function isAvailabilityBlocked(
  availability: SelfOrderAvailability | null | undefined,
  draftDemand = 0,
): boolean {
  if (!availability) return false;
  if (availability.is_disabled) return true;
  const remaining = remainingAfterDemand(availability, draftDemand);
  return remaining !== null && remaining <= 0;
}

/** Guest-facing sold-out badge — one label for disabled and exhausted. */
export function availabilityReasonLabel(
  availability: SelfOrderAvailability | null | undefined,
  draftDemand = 0,
): string | null {
  if (!isAvailabilityBlocked(availability, draftDemand)) return null;
  return SELF_ORDER_VI.reasonSoldOut;
}

export function remainingLabel(
  availability: SelfOrderAvailability | null | undefined,
  draftDemand = 0,
): string | null {
  if (isAvailabilityBlocked(availability, draftDemand)) return null;
  const remaining = remainingAfterDemand(availability, draftDemand);
  if (remaining === null) return null;
  return SELF_ORDER_VI.remainingOnCard(remaining);
}

export function menuItemAvailability(
  item: Pick<
    SelfOrderMenuItem,
    "is_disabled" | "available_to_sell" | "manual_limit_quantity"
  >,
): SelfOrderAvailability {
  return {
    is_disabled: item.is_disabled ?? false,
    available_to_sell: item.available_to_sell ?? null,
    manual_limit_quantity: item.manual_limit_quantity ?? null,
  };
}

export function buildCartDemandByMenuItemId(
  lines: ReadonlyArray<{
    menu_item_id: number;
    quantity: number;
    sides: ReadonlyArray<{ side_item_id: number; quantity: number }>;
  }>,
): Map<number, number> {
  const demand = new Map<number, number>();
  for (const line of lines) {
    demand.set(
      line.menu_item_id,
      (demand.get(line.menu_item_id) ?? 0) + line.quantity,
    );
    for (const side of line.sides) {
      demand.set(
        side.side_item_id,
        (demand.get(side.side_item_id) ?? 0) + line.quantity * side.quantity,
      );
    }
  }
  return demand;
}

function cartItemLabels(items: SelfOrderCartItem[]): Map<number, string> {
  const labels = new Map<number, string>();
  for (const item of items) {
    if (!labels.has(item.menu_item_id)) {
      labels.set(item.menu_item_id, item.item_name);
    }
    for (const side of item.sides) {
      if (!labels.has(side.side_item_id)) {
        labels.set(side.side_item_id, side.name);
      }
    }
  }
  return labels;
}

/** First quota conflict in the cart, with a guest-facing message. */
export function findCartSoldOutMessage(
  items: SelfOrderCartItem[],
  availabilityByItemId: Map<number, SelfOrderAvailability>,
): string | null {
  const demand = buildCartDemandByMenuItemId(items);
  const labels = cartItemLabels(items);

  for (const [menuItemId, quantity] of demand) {
    const availability = availabilityByItemId.get(menuItemId);
    if (!availability) continue;
    const itemName = labels.get(menuItemId) ?? `Món #${String(menuItemId)}`;

    if (availability.is_disabled) {
      return SELF_ORDER_VI.itemDisabledBlocked(itemName);
    }

    if (
      typeof availability.available_to_sell !== "number" ||
      !Number.isFinite(availability.available_to_sell)
    ) {
      continue;
    }

    const remaining = availability.available_to_sell;
    if (remaining >= quantity) continue;
    if (remaining <= 0) {
      return SELF_ORDER_VI.itemSoldOutBlocked(itemName);
    }
    return SELF_ORDER_VI.itemQuotaExceeded(itemName, remaining, quantity);
  }

  return null;
}
