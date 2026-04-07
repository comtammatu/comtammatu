import type { CartModifier, CartSide } from "../pos/types";

/** KDS station with assigned categories */
export interface KdsStation {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  kds_station_categories: { id: number; category_id: number }[];
}

/** Order item as displayed on KDS */
export interface KdsOrderItem {
  id: number;
  order_id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  modifiers: CartModifier[];
  sides: CartSide[];
  note: string | null;
  status: string;
  created_at: string;
  menu_item_id: number;
  orders: {
    order_number: string;
    order_type: string;
    table_id: number | null;
    status: string;
    created_at: string;
    tables: { number: number } | null;
  } | null;
}
