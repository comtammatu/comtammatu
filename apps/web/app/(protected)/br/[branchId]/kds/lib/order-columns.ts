import type { KdsOrder, KdsOrderItem } from "../types";

const ADD_ON_CATEGORY_NAME = "thêm";
const SIDE_DISH_CATEGORY_TYPE = "side_dish";

export type KdsOrderColumnId = "dine_in" | "takeaway" | "add_on";

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
    widthClass: "xl:col-span-4",
  },
  {
    id: "takeaway",
    title: "Mang về",
    emptyTitle: "Chưa có đơn mang về",
    widthClass: "xl:col-span-4",
  },
  {
    id: "add_on",
    title: "Món thêm",
    emptyTitle: "Chưa có món thêm",
    widthClass: "xl:col-span-2",
  },
] as const satisfies readonly KdsOrderColumnDefinition[];

function normalizeCategoryName(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("vi-VN");
}

export function isKdsAddOnItem(
  item: Pick<KdsOrderItem, "category_name" | "category_type"> | undefined,
): boolean {
  return (
    item?.category_type === SIDE_DISH_CATEGORY_TYPE &&
    normalizeCategoryName(item.category_name) === ADD_ON_CATEGORY_NAME
  );
}

export function getKdsOrderItemColumnId(
  item: Pick<KdsOrderItem, "category_name" | "category_type"> | undefined,
  orderType: string | null | undefined,
): KdsOrderColumnId {
  if (isKdsAddOnItem(item)) return "add_on";
  if (orderType === "takeaway") return "takeaway";
  return "dine_in";
}

export function getKdsScopedGroupKey(
  baseGroupKey: string,
  columnId: KdsOrderColumnId,
): string {
  return columnId === "add_on" ? `${baseGroupKey}:add_on` : baseGroupKey;
}

export function getKdsOrderColumnId(order: KdsOrder): KdsOrderColumnId {
  if (order.items.length > 0 && order.items.every(isKdsAddOnItem)) {
    return "add_on";
  }
  if (order.orderType === "takeaway") return "takeaway";
  return "dine_in";
}

export function getKdsOrderLabelOverride(order: KdsOrder): string | undefined {
  if (getKdsOrderColumnId(order) === "add_on") return "Món thêm";
  if (order.sendKind === "append") return "Gọi thêm";
  return undefined;
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
