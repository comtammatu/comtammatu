/* ─── Menu data types (derived from fetchMenuForPos action) ─── */

export interface MenuVariant {
  id: number;
  name: string;
  price_adjustment: number;
  sort_order: number;
}

interface MenuModifier {
  id: number;
  name: string;
  price: number;
  sort_order: number;
}

interface MenuAvailableSide {
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

export interface MenuCategory {
  id: number;
  name: string;
  type: string;
  sort_order: number;
  menu_items: MenuItem[];
}

