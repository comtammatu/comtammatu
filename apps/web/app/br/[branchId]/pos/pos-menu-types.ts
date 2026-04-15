import type { CategoryType } from "@comtammatu/shared";

/* ─── Menu data types (derived from fetchMenuForPos action) ─── */

export interface MenuVariant {
  id: number;
  name: string;
  price_adjustment: number;
  sort_order: number;
}

export interface MenuModifier {
  id: number;
  name: string;
  price: number;
  sort_order: number;
}

export interface MenuAvailableSide {
  id: number;
  is_default: boolean;
  side_item: { id: number; name: string; base_price: number };
}

export interface MenuItem {
  id: number;
  name: string;
  base_price: number;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  menu_item_variants: MenuVariant[];
  menu_item_modifiers: MenuModifier[];
  menu_item_available_sides: MenuAvailableSide[];
}

export interface MenuCategory {
  id: number;
  name: string;
  type: string;
  sort_order: number;
  menu_items: MenuItem[];
}

export const MENU_ZONE_ORDER: CategoryType[] = [
  "main_dish",
  "side_dish",
  "drink",
  "dessert",
];

/* ─── Helpers ─── */

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type PosFlowStepState = "done" | "current" | "todo";

export interface PosFlowStep {
  label: string;
  meta: string;
  state: PosFlowStepState;
}
