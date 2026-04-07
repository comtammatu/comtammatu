import {
  fetchGrns,
  fetchPurchaseOrders,
  fetchSuppliers,
} from "../procurement-actions";
import { GrnListClient } from "./grn-list-client";
import type { GrnListRow } from "./grn-list-client";
import type { SupplierRow } from "../suppliers/suppliers-client";
import type { PurchaseOrderRow } from "../purchase-orders/purchase-orders-client";

export default async function GrnListPage() {
  const [grnRes, supRes, poRes] = await Promise.all([
    fetchGrns(),
    fetchSuppliers(),
    fetchPurchaseOrders(),
  ]);
  const rows: GrnListRow[] = grnRes.success
    ? ((grnRes.data ?? []) as GrnListRow[])
    : [];
  const suppliers: SupplierRow[] = supRes.success
    ? ((supRes.data ?? []) as SupplierRow[])
    : [];
  const purchaseOrders: PurchaseOrderRow[] = poRes.success
    ? ((poRes.data ?? []) as PurchaseOrderRow[])
    : [];

  return (
    <GrnListClient
      initial={rows}
      suppliers={suppliers}
      purchaseOrders={purchaseOrders}
    />
  );
}
