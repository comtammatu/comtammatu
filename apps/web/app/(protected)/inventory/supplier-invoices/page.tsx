import {
  fetchGrnIdsForDropdown,
  fetchSupplierInvoicesPage,
} from "../procurement-actions";
import type { SupplierInvoiceCursor } from "../procurement-actions";
import { fetchSuppliers } from "../supplier-actions";
import { resolveRequestedBranchId } from "../_lib/inventory-scope";
import {
  SupplierInvoicesClient,
  mapSupplierInvoiceRow,
} from "./supplier-invoices-client";

export default async function SupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchFilter =
    (await resolveRequestedBranchId(params.branchId)) ?? undefined;

  const [res, suppliersRes, grnsRes] = await Promise.all([
    fetchSupplierInvoicesPage({ branchId: branchFilter }),
    fetchSuppliers(),
    fetchGrnIdsForDropdown(branchFilter),
  ]);
  const page = res.success
    ? res.data
    : { items: [], hasMore: false, nextCursor: null };
  const dbRows = (page?.items ?? []) as Array<Record<string, unknown>>;
  const initialHasMore = page?.hasMore ?? false;
  const initialNextCursor = (page?.nextCursor ??
    null) as SupplierInvoiceCursor | null;

  const invoices = dbRows.map(mapSupplierInvoiceRow);

  const suppliers = suppliersRes.success
    ? ((suppliersRes.data ?? []) as Array<Record<string, unknown>>).map(
        (row) => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? "—"),
        }),
      )
    : [];

  const grns = grnsRes.success
    ? ((grnsRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: Number(row.id ?? 0),
        code: String(row.grn_number ?? "—"),
        supplierId: Number(row.supplier_id ?? 0),
        supplierName: String(
          ((row.suppliers as Record<string, unknown> | null)?.name as string) ??
            "—",
        ),
      }))
    : [];

  return (
    <SupplierInvoicesClient
      invoices={invoices}
      suppliers={suppliers}
      grns={grns}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
      branchId={branchFilter}
    />
  );
}
