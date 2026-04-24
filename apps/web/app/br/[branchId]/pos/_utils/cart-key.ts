import type { CartModifier, CartSide } from "../types";

export function makeCartKey(
  itemId: number,
  variantId: number | undefined,
  modifiers: CartModifier[],
  sides: CartSide[],
): string {
  const modIds = modifiers
    .map((m) => m.modifier_id)
    .sort((a, b) => a - b)
    .join(",");
  const sideIds = sides
    .map((s) => `${String(s.side_item_id)}x${String(s.quantity)}`)
    .sort()
    .join(",");
  return `${String(itemId)}-${String(variantId ?? 0)}-${modIds}-${sideIds}`;
}

export function makeNotedCartKey(baseKey: string): string {
  return `${baseKey}-n:${crypto.randomUUID()}`;
}
