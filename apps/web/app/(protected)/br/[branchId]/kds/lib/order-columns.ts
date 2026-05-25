import type { KdsOrder } from "../types";

export type KdsOrderColumnId = "dine_in" | "takeaway" | "append";

export interface KdsOrderColumnDefinition {
  id: KdsOrderColumnId;
  title: string;
  emptyTitle: string;
  widthClass: string;
}

export interface KdsOrderColumn extends KdsOrderColumnDefinition {
  orders: KdsOrder[];
}

export const KDS_ORDER_COLUMN_DEFINITIONS = [
  {
    id: "dine_in",
    title: "Tại chỗ",
    emptyTitle: "Chưa có đơn tại chỗ",
    widthClass: "lg:col-span-4",
  },
  {
    id: "takeaway",
    title: "Mang về",
    emptyTitle: "Chưa có đơn mang về",
    widthClass: "lg:col-span-4",
  },
  {
    id: "append",
    title: "Gọi thêm",
    emptyTitle: "Chưa có món gọi thêm",
    widthClass: "md:col-span-2 lg:col-span-2",
  },
] as const satisfies readonly KdsOrderColumnDefinition[];

export function getKdsOrderColumnId(order: KdsOrder): KdsOrderColumnId {
  if (order.sendKind === "append") return "append";
  if (order.orderType === "takeaway") return "takeaway";
  return "dine_in";
}

export function groupKdsOrdersByColumn(
  orders: readonly KdsOrder[],
): KdsOrderColumn[] {
  const grouped = new Map<KdsOrderColumnId, KdsOrder[]>();
  for (const definition of KDS_ORDER_COLUMN_DEFINITIONS) {
    grouped.set(definition.id, []);
  }

  for (const order of orders) {
    grouped.get(getKdsOrderColumnId(order))?.push(order);
  }

  return KDS_ORDER_COLUMN_DEFINITIONS.map((definition) => ({
    ...definition,
    orders: grouped.get(definition.id) ?? [],
  }));
}
