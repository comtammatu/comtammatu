"use client";

import { memo } from "react";
import { PosMenuGrid } from "../pos-menu-grid";
import type { MenuCategory, MenuItem } from "../pos-menu-types";

interface MenuPaneProps {
  categories: MenuCategory[];
  onItemTap: (item: MenuItem) => void;
}

function MenuPaneComponent({ categories, onItemTap }: MenuPaneProps) {
  return <PosMenuGrid categories={categories} onItemTap={onItemTap} />;
}

export const MenuPane = memo(MenuPaneComponent);
