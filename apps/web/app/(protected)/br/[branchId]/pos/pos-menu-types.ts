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
  /** Compatibility stock cap; use available_to_sell when present. */
  stock_capacity?: number | null;
  stock_capacity_live?: number | null;
  manual_limit_quantity?: number | null;
  accepted_today?: number | null;
  pending_unfinalized_demand?: number | null;
  active_hold_demand?: number | null;
  available_to_sell?: number | null;
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
  /**
   * Snapshot upper bound on how many of this dish are still sellable given
   * current kitchen ingredient stock (`max_sellable` from
   * `get_branch_menu_ingredient_caps_for_pos`). `null` when the branch flag
   * `pos_ingredient_stock_block` is off, or the dish has no recipe — i.e. no
   * cap. Advisory only: shared ingredients couple dishes, so the server's
   * order_items trigger is the authoritative gate.
   */
  ingredient_cap?: number | null;
}

export interface MenuCategory {
  id: number;
  name: string;
  type: string;
  sort_order: number;
  menu_items: MenuItem[];
}
