import type { SelfOrderCartItem } from "@lib/self-order/contracts";

function isUncustomizedLine(item: SelfOrderCartItem): boolean {
  const note = item.note?.trim() ?? "";
  return note === "" && item.modifiers.length === 0 && item.sides.length === 0;
}

export function addOrIncrementSimpleCartItem(
  items: readonly SelfOrderCartItem[],
  incoming: SelfOrderCartItem,
): SelfOrderCartItem[] {
  if (!isUncustomizedLine(incoming)) {
    return [...items, incoming];
  }

  const matchIndex = items.findIndex(
    (existing) =>
      isUncustomizedLine(existing) &&
      existing.menu_item_id === incoming.menu_item_id &&
      (existing.variant_id ?? null) === (incoming.variant_id ?? null),
  );
  if (matchIndex < 0) {
    return [...items, incoming];
  }

  return items.map((existing, index) =>
    index === matchIndex
      ? {
          ...existing,
          quantity: Math.min(99, existing.quantity + incoming.quantity),
        }
      : existing,
  );
}

export function decreaseCartItemByMenuItemId(
  items: readonly SelfOrderCartItem[],
  menuItemId: number,
): SelfOrderCartItem[] {
  let lastIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.menu_item_id === menuItemId) {
      lastIndex = index;
      break;
    }
  }
  if (lastIndex < 0) return [...items];
  const target = items[lastIndex];
  if (!target) return [...items];
  if (target.quantity <= 1) {
    return items.filter((_, index) => index !== lastIndex);
  }
  return items.map((item, index) =>
    index === lastIndex ? { ...item, quantity: item.quantity - 1 } : item,
  );
}
