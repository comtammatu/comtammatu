import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { messages } from "@lib/messages";
import {
  fetchGrnIdsForDropdown,
  fetchSupplierInvoicesPage,
} from "../../inventory/procurement-actions";
import type { SupplierInvoiceCursor } from "../../inventory/procurement-actions";
import { fetchSuppliers } from "../../inventory/supplier-actions";
import { resolveRequestedBranchId } from "../../inventory/_lib/inventory-scope";
import { SupplierInvoicesClient } from "../../inventory/supplier-invoices/supplier-invoices-client";
import { mapSupplierInvoiceRow } from "../../inventory/supplier-invoices/supplier-invoice-row";

export default async function FinanceSupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    branchId?: string | string[];
  }>;
}) {
  const copy = messages.finance.supplierInvoicesPage;
  const [canReadProcurement, canPaySupplier] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_AP_PAY),
  ]);

  if (!canReadProcurement) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
        />
        <AppEmptyState
          mode="no-access"
          title={copy.noAccessTitle}
          description={copy.noAccessDescription}
        />
      </AppPage>
    );
  }

  const params = await searchParams;
  const branchFilter =
    (await resolveRequestedBranchId(params.branchId ?? params.branch)) ??
    undefined;

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
      canPaySupplier={canPaySupplier}
      eyebrow={copy.eyebrow}
      description={copy.description}
    />
  );
}
