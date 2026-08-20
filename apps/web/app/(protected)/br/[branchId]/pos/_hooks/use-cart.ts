"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePosCartStore } from "../_providers/pos-desktop-provider";
import type { CartSnapshot } from "../_providers/cart-store";
import { calcCartTotal } from "../types";
import type { CartItem, CartModifier, CartSide, DeliveryPlatform, OrderType } from "../types";
import type { MenuItem } from "../pos-menu-types";

export function useCartSnapshot(): CartSnapshot {
  const store = usePosCartStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

export function useCartOrderType(): OrderType {
  const store = usePosCartStore();
  const getOrderType = useCallback(
    () => store.getSnapshot().orderType,
    [store],
  );
  return useSyncExternalStore(store.subscribe, getOrderType, getOrderType);
}

export function useCartItemCount(): number {
  const store = usePosCartStore();
  const getItemCount = useCallback(
    () => store.getSnapshot().items.length,
    [store],
  );
  return useSyncExternalStore(store.subscribe, getItemCount, getItemCount);
}

export function useCartQuantity(): number {
  const store = usePosCartStore();
  const getQuantity = useCallback(
    () =>
      store.getSnapshot().items.reduce((sum, item) => sum + item.quantity, 0),
    [store],
  );
  return useSyncExternalStore(store.subscribe, getQuantity, getQuantity);
}

export function useCartTotal(): number {
  const store = usePosCartStore();
  const getTotal = useCallback(
    () => calcCartTotal(store.getSnapshot().items),
    [store],
  );
  return useSyncExternalStore(store.subscribe, getTotal, getTotal);
}

export function useCartItemQuantity(menuItemId: number): number {
  const store = usePosCartStore();
  const getItemQuantity = useCallback(() => {
    return store
      .getSnapshot()
      .items.filter((i) => i.menu_item_id === menuItemId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }, [store, menuItemId]);
  return useSyncExternalStore(store.subscribe, getItemQuantity, getItemQuantity);
}

export function useCartActions() {
  const store = usePosCartStore();

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
        quantity?: number;
        discountType?: "vnd";
        discountValue?: number;
        discountNote?: string;
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
  const setNote = useCallback((note: string) => store.setNote(note), [store]);
  const setOrderType = useCallback(
    (t: OrderType) => store.setOrderType(t),
    [store],
  );
  const setDeliveryPlatform = useCallback(
    (platform: DeliveryPlatform | null) => store.setDeliveryPlatform(platform),
    [store],
  );
  const setExternalOrderRef = useCallback(
    (ref: string) => store.setExternalOrderRef(ref),
    [store],
  );
  const replaceItems = useCallback(
    (items: CartItem[]) => store.replaceItems(items),
    [store],
  );

  return useMemo(
    () => ({
      addItem,
      updateQuantity,
      removeItem,
      clear,
      setNote,
      setOrderType,
      setDeliveryPlatform,
      setExternalOrderRef,
      replaceItems,
    }),
    [
      addItem,
      updateQuantity,
      removeItem,
      clear,
      setNote,
      setOrderType,
      setDeliveryPlatform,
      setExternalOrderRef,
      replaceItems,
    ],
  );
}

export function useCart() {
  const snapshot = useCartSnapshot();
  const actions = useCartActions();

  const { total, quantity } = useMemo(
    () => ({
      total: calcCartTotal(snapshot.items),
      quantity: snapshot.items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    [snapshot.items],
  );

  return {
    items: snapshot.items,
    note: snapshot.note,
    orderType: snapshot.orderType,
    deliveryPlatform: snapshot.deliveryPlatform,
    externalOrderRef: snapshot.externalOrderRef,
    total,
    quantity,
    ...actions,
  };
}
