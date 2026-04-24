"use client";

import { PosMenuGrid } from "../pos-menu-grid";
import type { MenuCategory, MenuItem } from "../pos-menu-types";
import { useCart } from "../_hooks/use-cart";
import { useActiveTable } from "../_hooks/use-active-table";

interface MenuPaneProps {
  categories: MenuCategory[];
  onItemTap: (item: MenuItem) => void;
}

export function MenuPane({ categories, onItemTap }: MenuPaneProps) {
  const cart = useCart();
  const activeTable = useActiveTable();

  return (
    <PosMenuGrid
      categories={categories}
      cartQuantity={cart.quantity}
      cartTotal={cart.total}
      orderType={cart.orderType}
      selectedTableNumber={activeTable.table?.number}
      onItemTap={onItemTap}
    />
  );
}
