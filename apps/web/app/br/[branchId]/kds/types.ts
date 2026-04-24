/** KDS station from DB */
export interface KdsStation {
  id: number;
  name: string;
  position: number;
  is_active: boolean;
}

/** KDS ticket from DB */
export interface KdsTicket {
  id: number;
  station_id: number;
  order_id: number;
  order_item_id: number;
  status: string;
  bumped_at: string | null;
  created_at: string;
}

/** Order info for KDS display */
export interface KdsOrderInfo {
  id: number;
  order_number: string;
  order_type: string;
  table_id: number | null;
  created_at: string;
  tables: { number: number } | null;
}

/** Snapshot shape for `order_items.modifiers` JSONB (per create_orders migration). */
export interface OrderItemModifier {
  modifier_id: number;
  name: string;
  price: number;
}

/** Snapshot shape for `order_items.sides` JSONB (per pos_order_sides_pricing migration). */
export interface OrderItemSide {
  side_item_id: number;
  name: string;
  price: number;
  is_default: boolean;
}

/** Order item for KDS display */
export interface KdsOrderItem {
  id: number;
  order_id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  status: string;
  note: string | null;
  modifiers: OrderItemModifier[] | null;
  sides: OrderItemSide[] | null;
}

/** Grouped order with its tickets and items for display */
export interface KdsOrder {
  orderId: number;
  orderNumber: string;
  orderType: string;
  tableNumber: number | null;
  createdAt: string;
  tickets: KdsTicket[];
  items: KdsOrderItem[];
}

/** KdsBoard component props */
export interface KdsBoardProps {
  branchId: number;
  stations: KdsStation[];
  /** Stations with zero category mappings — receive unrouted tickets. */
  fallbackStationIds: number[];
  /** Whether current user has `kds:mark_ready` (controls bump button). */
  canMarkReady: boolean;
  /** Whether current user has `kds:recall` (controls recall button). */
  canRecall: boolean;
  initialTickets: KdsTicket[];
  initialOrders: KdsOrderInfo[];
  initialOrderItems: KdsOrderItem[];
}

/** URL query: status filter */
export type TicketStatusFilter = "all" | "active" | "pending" | "preparing" | "ready";

/** URL query: order type filter */
export type OrderTypeFilter = "all" | "dine_in" | "takeaway";

/** Filter option config */
export interface FilterOption<T extends string> {
  value: T;
  label: string;
}
