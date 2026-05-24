import { fetchPurchaseOrders, fetchSuppliers } from "../procurement-actions";
import { resolveRequestedBranchId } from "../_lib/inventory-scope";
import {
  PurchaseOrdersClient,
  type PurchaseOrderRow,
} from "./purchase-orders-client";
import type { SupplierRow } from "../suppliers/suppliers-client";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchFilter =
    (await resolveRequestedBranchId(params.branchId)) ?? undefined;

  const [poRes, supRes] = await Promise.all([
    fetchPurchaseOrders(branchFilter),
    fetchSuppliers(),
  ]);

  const rows: PurchaseOrderRow[] = poRes.success
    ? ((poRes.data ?? []) as PurchaseOrderRow[])
    : [];

  const suppliers: SupplierRow[] = supRes.success
    ? ((supRes.data ?? []) as SupplierRow[])
    : [];

  return (
    <PurchaseOrdersClient
      initial={rows}
      suppliers={suppliers}
      purchaseOrdersBasePath="/inventory/purchase-orders"
      suppliersPath="/inventory/suppliers"
    />
  );
}
