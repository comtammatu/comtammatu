import { ORDER_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import type { KdsOrder, KdsOrderItem } from "../types";

const COM_CATEGORY_NAME = "cơm";
const SIDE_DISH_CATEGORY_TYPE = "side_dish";
/** Category display names treated as accompaniment when sale-time type is missing. */
const ADD_ON_CATEGORY_NAMES = new Set([
  "thêm",
  "món thêm",
  "món kèm",
  "kèm",
  "món phụ",
]);

export type KdsOrderColumnId = "dine_in" | "takeaway" | "add_on";

export interface KdsOrderColumnDefinition {
  id: KdsOrderColumnId;
  title: string;
  emptyTitle: string;
  /** Pin the lane to a fixed track so a sibling cannot auto-place it. */
  widthClass: string;
}

export interface KdsOrderColumn extends KdsOrderColumnDefinition {
  orders: KdsOrder[];
}

export const KDS_ORDER_COLUMN_DEFINITIONS = [
  {
    id: "dine_in",
    title: ORDER_TYPE_LABELS_VI.dine_in,
    emptyTitle: "Chưa có đơn tại bàn",
    widthClass: "md:col-start-1",
  },
  {
    id: "takeaway",
    title: ORDER_TYPE_LABELS_VI.takeaway,
    emptyTitle: "Chưa có đơn mang về",
    widthClass: "md:col-start-2",
  },
  {
    id: "add_on",
    title: "Món thêm",
    emptyTitle: "Chưa có món thêm",
    widthClass: "md:col-start-3",
  },
] as const satisfies readonly KdsOrderColumnDefinition[];

function normalizeCategoryName(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("vi-VN");
}

export function isKdsAddOnItem(
  item: Pick<KdsOrderItem, "category_name" | "category_type"> | undefined,
): boolean {
  if (item?.category_type === SIDE_DISH_CATEGORY_TYPE) return true;
  if (item?.category_type) return false;
  return ADD_ON_CATEGORY_NAMES.has(normalizeCategoryName(item?.category_name));
}

/** Named Cơm category only — not item names and not other main_dish categories. */
export function isKdsComCategory(
  item: Pick<KdsOrderItem, "category_name"> | undefined,
): boolean {
  return normalizeCategoryName(item?.category_name) === COM_CATEGORY_NAME;
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

function getKdsOrderColumnId(order: KdsOrder): KdsOrderColumnId {
  if (order.items.length > 0 && order.items.every(isKdsAddOnItem)) {
    return "add_on";
  }
  if (order.orderType === "takeaway") return "takeaway";
  return "dine_in";
}

/** Append and add-on tickets use the same table/order title as the first send. */
export function getKdsOrderLabelOverride(_order: KdsOrder): string | undefined {
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
