import { fetchPurchaseOrders, fetchSuppliers } from "../procurement-actions";
import { PurchaseOrdersClient } from "./purchase-orders-client";
import type { PurchaseOrderRow } from "./purchase-orders-client";
import type { SupplierRow } from "../suppliers/suppliers-client";

export default async function PurchaseOrdersPage() {
  const [poRes, supRes] = await Promise.all([
    fetchPurchaseOrders(),
    fetchSuppliers(),
  ]);
  const rows: PurchaseOrderRow[] = poRes.success
    ? ((poRes.data ?? []) as PurchaseOrderRow[])
    : [];
  const suppliers: SupplierRow[] = supRes.success
    ? ((supRes.data ?? []) as SupplierRow[])
    : [];

  return <PurchaseOrdersClient initial={rows} suppliers={suppliers} />;
}
