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

/** Order item for KDS display */
export interface KdsOrderItem {
  id: number;
  order_id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  status: string;
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
