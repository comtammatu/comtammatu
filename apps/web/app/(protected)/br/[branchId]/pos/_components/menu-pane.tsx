"use client";

import { memo } from "react";
import { PosMenuGrid } from "../pos-menu-grid";
import type { MenuCategory, MenuItem } from "../pos-menu-types";
import type { DeliveryPlatform, OrderType } from "../types";

interface MenuPaneProps {
  categories: MenuCategory[];
  dailyLimitDemandByMenuItem?: ReadonlyMap<number, number>;
  orderType?: OrderType;
  deliveryPlatform?: DeliveryPlatform | null;
  onItemTap: (item: MenuItem) => void;
}

function MenuPaneComponent({
  categories,
  dailyLimitDemandByMenuItem,
  orderType = "takeaway",
  deliveryPlatform = null,
  onItemTap,
}: MenuPaneProps) {
  return (
    <PosMenuGrid
      categories={categories}
      dailyLimitDemandByMenuItem={dailyLimitDemandByMenuItem}
      orderType={orderType}
      deliveryPlatform={deliveryPlatform}
      onItemTap={onItemTap}
    />
  );
}

export const MenuPane = memo(MenuPaneComponent);
