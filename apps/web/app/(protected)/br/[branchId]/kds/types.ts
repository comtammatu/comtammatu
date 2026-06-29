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
  kitchen_send_batch_id: number | null;
  status: string;
  bumped_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Kitchen send batch for queue numbering. */
export interface KdsKitchenSendBatch {
  id: number;
  order_id: number;
  kitchen_ticket_number: string;
  send_seq: number;
  kind: string;
  created_at: string;
}

/** Order info for KDS display */
export interface KdsOrderInfo {
  id: number;
  order_number: string;
  order_type: string;
  table_id: number | null;
  is_priority: boolean;
  note: string | null;
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
  quantity?: number;
  is_default: boolean;
}

/** Order item for KDS display */
export interface KdsOrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  item_name: string;
  category_name: string | null;
  category_type: string | null;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  status: string;
  is_priority: boolean;
  note: string | null;
  modifiers: OrderItemModifier[] | null;
  sides: OrderItemSide[] | null;
}

/** Branch menu daily limit row reused by KDS dispatch controls. */
export interface KdsMenuLimitRow {
  menu_item_id: number;
  item_name: string;
  category_id: number;
  category_name: string;
  base_price: number;
  limit_id: number | null;
  limit_date: string | null;
  limit_quantity: number | null;
  is_disabled: boolean;
  sold_today: number;
  stock_capacity: number | null;
}

/** Grouped order with its tickets and items for display */
export interface KdsOrder {
  groupKey: string;
  orderId: number;
  orderNumber: string;
  kitchenTicketNumber: string;
  orderType: string;
  tableNumber: number | null;
  createdAt: string;
  sendSeq: number | null;
  sendKind: string | null;
  isPriority: boolean;
  orderNote: string | null;
  tickets: KdsTicket[];
  items: KdsOrderItem[];
}

/** KdsBoard component props */
export interface KdsBoardProps {
  branchId: number;
  /** Server render time snapshot used for hydration-stable elapsed timers. */
  initialNowMs: number;
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
  initialKitchenBatches: KdsKitchenSendBatch[];
  initialMenuLimits: KdsMenuLimitRow[];
}

/** URL query: order type filter */
export type OrderTypeFilter = "all" | "dine_in" | "takeaway";

/** Filter option config */
export interface FilterOption<T extends string> {
  value: T;
  label: string;
}
