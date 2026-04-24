"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePosCartStore } from "../_providers/pos-desktop-provider";
import type { CartSnapshot } from "../_providers/cart-store";
import { calcCartTotal } from "../types";
import type { CartItem, CartModifier, CartSide, OrderType } from "../types";
import type { MenuItem } from "../pos-menu-types";

export function useCartSnapshot(): CartSnapshot {
  const store = usePosCartStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useCart() {
  const store = usePosCartStore();
  const snapshot = useCartSnapshot();

  const addItem = useCallback(
    (
      item: MenuItem,
      opts?: {
        variantId?: number;
        variantName?: string;
        unitPrice?: number;
        modifiers?: CartModifier[];
        sides?: CartSide[];
        note?: string;
      },
    ) => {
      store.addItem(item, opts);
    },
    [store],
  );

  const updateQuantity = useCallback(
    (key: string, delta: number) => store.updateQuantity(key, delta),
    [store],
  );

  const removeItem = useCallback(
    (key: string) => store.removeItem(key),
    [store],
  );

  const clear = useCallback(() => store.clear(), [store]);

  const setNote = useCallback(
    (note: string) => store.setNote(note),
    [store],
  );

  const setOrderType = useCallback(
    (t: OrderType) => store.setOrderType(t),
    [store],
  );

  const replaceItems = useCallback(
    (items: CartItem[]) => store.replaceItems(items),
    [store],
  );

  const total = calcCartTotal(snapshot.items);
  const quantity = snapshot.items.reduce((sum, i) => sum + i.quantity, 0);

  return {
    items: snapshot.items,
    note: snapshot.note,
    orderType: snapshot.orderType,
    total,
    quantity,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    setNote,
    setOrderType,
    replaceItems,
  };
}
