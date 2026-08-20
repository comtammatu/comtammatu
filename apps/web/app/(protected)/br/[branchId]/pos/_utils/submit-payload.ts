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

  if (cartSnapshot.orderType === "delivery") {
    if (cartSnapshot.deliveryPlatform != null) {
      cart.delivery_platform = cartSnapshot.deliveryPlatform;
    }
    const ref = cartSnapshot.externalOrderRef.trim();
    if (ref.length > 0) {
      cart.external_order_ref = ref;
    }
  }

  if (isPriority === true) {
    cart.is_priority = true;
  }

  return cart;
}
