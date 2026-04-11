import { fetchPurchaseOrders } from "../procurement-actions";
import { formatDate } from "../_lib/format";
import { PurchaseOrdersClient } from "./purchase-orders-client";
import type { PurchaseOrderRow } from "./purchase-orders-client";

export default async function PurchaseOrdersPage() {
  const res = await fetchPurchaseOrders();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const orders: PurchaseOrderRow[] = dbRows.map((row) => ({
    id: row.id as number,
    code: (row.po_number as string) ?? "",
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
    status: (row.status as string) ?? "draft",
    date: row.order_date ? formatDate(row.order_date as string) : "—",
    expectedDelivery: row.expected_delivery
      ? formatDate(row.expected_delivery as string)
      : null,
    total: Number(row.total_amount ?? 0),
    createdBy: "—",
  }));

  return <PurchaseOrdersClient orders={orders} />;
}
