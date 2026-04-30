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

/**
 * Per-day sales limit attached to a menu item for THIS branch.
 * Absent (`null`) when no limit is configured for today.
 */
export interface MenuItemDailyLimit {
  /** Cap on portions sellable today; null = unlimited. */
  limit_quantity: number | null;
  /** Manager toggled the item OFF for the day. */
  is_disabled: boolean;
  /** Portions already taken by accepted orders today. */
  sold_today: number;
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
  daily_limit: MenuItemDailyLimit | null;
}

/** UI helper: how many portions may still be added to the cart. */
export function remainingDailyQuota(item: MenuItem): number | null {
  if (!item.daily_limit) return null;
  if (item.daily_limit.limit_quantity == null) return null;
  return Math.max(0, item.daily_limit.limit_quantity - item.daily_limit.sold_today);
}

export function isItemBlockedByDailyLimit(item: MenuItem): boolean {
  if (!item.daily_limit) return false;
  if (item.daily_limit.is_disabled) return true;
  const remaining = remainingDailyQuota(item);
  return remaining !== null && remaining <= 0;
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
