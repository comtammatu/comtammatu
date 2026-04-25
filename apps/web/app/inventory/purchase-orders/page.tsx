import { fetchPurchaseOrders, fetchSuppliers } from "../procurement-actions";
import { resolveRequestedBranchId } from "../_lib/inventory-scope";
import {
  PurchaseOrdersClient,
  type PurchaseOrderRow,
} from "./purchase-orders-client";
import type { SupplierRow } from "../suppliers/suppliers-client";

function parseHighlightIds(value: string | string[] | undefined): number[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  return out;
}

function parseStatusFilter(
  value: string | string[] | undefined,
): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "draft" || raw === "sent" || raw === "received") return raw;
  return null;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    filter?: string | string[];
    highlight?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const branchFilter =
    (await resolveRequestedBranchId(params.branchId)) ?? undefined;
  const statusFilter = parseStatusFilter(params.filter);
  const highlightIds = parseHighlightIds(params.highlight);

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
      initialStatusFilter={statusFilter}
      highlightIds={highlightIds}
    />
  );
}
