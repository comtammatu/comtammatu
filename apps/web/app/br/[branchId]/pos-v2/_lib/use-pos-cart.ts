"use client";

import { useCallback, useMemo, useState } from "react";
import type { CartItem, CartModifier, CartSide } from "../../pos/types";
import { calcCartTotal } from "../../pos/types";
import type { MenuItem } from "../../pos/pos-menu-types";

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
    .map((s) => s.side_item_id)
    .sort((a, b) => a - b)
    .join(",");
  return `${String(itemId)}-${String(variantId ?? 0)}-${modIds}-${sideIds}`;
}

export interface PosCart {
  items: CartItem[];
  total: number;
  quantity: number;
  note: string;
  setNote: (note: string) => void;
  addItem: (
    item: MenuItem,
    variantId?: number,
    variantName?: string,
    unitPrice?: number,
    modifiers?: CartModifier[],
    sides?: CartSide[],
  ) => void;
  setItems: (items: CartItem[]) => void;
  updateQuantity: (key: string, delta: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

export function usePosCart(): PosCart {
  const [items, setItems] = useState<CartItem[]>([]);
  const [note, setNote] = useState("");

  const addItem = useCallback<PosCart["addItem"]>(
    (item, variantId, variantName, unitPrice, modifiers = [], sides = []) => {
      const price = unitPrice ?? item.base_price;
      const key = makeCartKey(item.id, variantId, modifiers, sides);
      setItems((prev) => {
        const existing = prev.find((ci) => ci.key === key);
        if (existing) {
          return prev.map((ci) =>
            ci.key === key ? { ...ci, quantity: ci.quantity + 1 } : ci,
          );
        }
        return [
          ...prev,
          {
            key,
            menu_item_id: item.id,
            item_name: item.name,
            variant_id: variantId,
            variant_name: variantName,
            quantity: 1,
            unit_price: price,
            modifiers,
            sides,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback((key: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((ci) =>
          ci.key === key ? { ...ci, quantity: ci.quantity + delta } : ci,
        )
        .filter((ci) => ci.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((ci) => ci.key !== key));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setNote("");
  }, []);

  const total = useMemo(() => calcCartTotal(items), [items]);
  const quantity = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  return {
    items,
    total,
    quantity,
    note,
    setNote,
    addItem,
    setItems,
    updateQuantity,
    removeItem,
    clear,
  };
}
