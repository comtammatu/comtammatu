import type { BranchTable } from "../page";
import type { SessionOrder } from "../order-history";

export function tableLabelForTableId(
  tables: readonly BranchTable[],
  tableId: number,
): string | undefined {
  const tableNumber = tables.find((table) => table.id === tableId)?.number;
  return typeof tableNumber === "number" ? String(tableNumber) : undefined;
}

export function tableLabelForOrderId(
  tables: readonly BranchTable[],
  orders: readonly SessionOrder[],
  orderId: number,
): string | undefined {
  const order = orders.find((item) => item.id === orderId);
  if (typeof order?.tables?.number === "number") {
    return String(order.tables.number);
  }
  if (typeof order?.table_id === "number") {
    return tableLabelForTableId(tables, order.table_id);
  }
  return undefined;
}
