import type { CartSnapshot } from "../_providers/cart-store";
import type { CartState } from "../types";

export interface BuildSubmitOrderCartArgs {
  cartSnapshot: CartSnapshot;
  tableId?: number | null;
  isPriority?: boolean;
}

export function buildSubmitOrderCart({
  cartSnapshot,
  tableId,
  isPriority,
}: BuildSubmitOrderCartArgs): CartState {
  const cart: CartState = {
    items: cartSnapshot.items,
    order_type: cartSnapshot.orderType,
    table_id: tableId ?? undefined,
    note: cartSnapshot.note.trim() || undefined,
  };

  if (isPriority === true) {
    cart.is_priority = true;
  }

  return cart;
}
