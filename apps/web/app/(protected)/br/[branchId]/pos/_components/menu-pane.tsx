"use client";

import { memo } from "react";
import { PosMenuGrid } from "../pos-menu-grid";
import type { MenuCategory, MenuItem } from "../pos-menu-types";

interface MenuPaneProps {
  categories: MenuCategory[];
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  hasStackedTouchActions?: boolean;
  onItemTap: (item: MenuItem) => void;
}

function MenuPaneComponent({
  categories,
  dailyLimitDemandByMenuItem,
  hasStackedTouchActions,
  onItemTap,
}: MenuPaneProps) {
  return (
    <PosMenuGrid
      categories={categories}
      dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
      hasStackedTouchActions={hasStackedTouchActions}
      onItemTap={onItemTap}
    />
  );
}

export const MenuPane = memo(MenuPaneComponent);
