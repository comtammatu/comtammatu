import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
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
import { parseSupplierInvoiceListFilters } from "../../inventory/supplier-invoices/supplier-invoice-list-model";
import { mapSupplierInvoiceRow } from "../../inventory/supplier-invoices/supplier-invoice-row";

export default async function FinanceSupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    branchId?: string | string[];
    invoiceId?: string | string[];
    q?: string | string[];
    supplierId?: string | string[];
    matchStatus?: string | string[];
    paymentStatus?: string | string[];
    overdue?: string | string[];
    view?: string | string[];
  }>;
}) {
  const copy = messages.finance.supplierInvoicesPage;
  const renderMissingInvoice = () => (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />
      <AppEmptyState
        mode="no-data"
        title={copy.notFoundTitle}
        description={copy.notFoundDescription}
      />
    </AppPage>
  );
  const [authState, canReadProcurement, hasPayPermission] = await Promise.all([
    loadAuthState(),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_AP_PAY),
  ]);
  const canPaySupplier =
    authState.claims.user_role === "owner" && hasPayPermission;

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
  const filters = parseSupplierInvoiceListFilters(params);
  const rawInvoiceId = Array.isArray(params.invoiceId)
    ? params.invoiceId[0]
    : params.invoiceId;
  const parsedInvoiceId =
    typeof rawInvoiceId === "string" && /^\d+$/.test(rawInvoiceId)
      ? Number(rawInvoiceId)
      : null;
  const requestedInvoiceId =
    parsedInvoiceId != null &&
    Number.isSafeInteger(parsedInvoiceId) &&
    parsedInvoiceId > 0
      ? parsedInvoiceId
      : null;
  if (rawInvoiceId != null && requestedInvoiceId == null) {
    return renderMissingInvoice();
  }

  const [res, suppliersRes, grnsRes, requestedInvoiceRes] = await Promise.all([
    fetchSupplierInvoicesPage({
      branchId: branchFilter,
      query: filters.query,
      supplierId: filters.supplierId ?? undefined,
      matchStatus: filters.matchStatus ?? undefined,
      paymentStatus: filters.paymentStatus ?? undefined,
      overdueOnly: filters.overdueOnly,
      viewMode: filters.viewMode,
    }),
    fetchSuppliers(),
    fetchGrnIdsForDropdown(branchFilter),
    requestedInvoiceId != null
      ? fetchSupplierInvoicesPage({
          branchId: branchFilter,
          invoiceId: requestedInvoiceId,
          pageSize: 1,
        })
      : Promise.resolve(null),
  ]);
  if (
    !res.success ||
    !suppliersRes.success ||
    !grnsRes.success ||
    requestedInvoiceRes?.success === false
  ) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
        />
        <AppEmptyState
          mode="error"
          title={copy.loadErrorTitle}
          description={copy.loadErrorDescription}
        />
      </AppPage>
    );
  }

  const page = res.data;
  const requestedInvoiceRow =
    requestedInvoiceRes?.success === true
      ? ((requestedInvoiceRes.data?.items[0] ?? null) as Record<
          string,
          unknown
        > | null)
      : null;
  if (requestedInvoiceId != null && requestedInvoiceRow == null) {
    return renderMissingInvoice();
  }

  const pageRows = (page?.items ?? []) as Array<Record<string, unknown>>;
  const dbRows = requestedInvoiceRow
    ? [
        requestedInvoiceRow,
        ...pageRows.filter(
          (row) => Number(row.id) !== Number(requestedInvoiceRow.id),
        ),
      ]
    : pageRows;
  const initialHasMore = page?.hasMore ?? false;
  const initialNextCursor = (page?.nextCursor ??
    null) as SupplierInvoiceCursor | null;

  const invoices = dbRows.map(mapSupplierInvoiceRow);
  const suppliers = (
    (suppliersRes.data ?? []) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: Number(row.id ?? 0),
    name: String(row.name ?? "—"),
  }));
  const grns = ((grnsRes.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: Number(row.id ?? 0),
      code: String(row.grn_number ?? "—"),
      supplierId: Number(row.supplier_id ?? 0),
      supplierName: String(
        ((row.suppliers as Record<string, unknown> | null)?.name as string) ??
          "—",
      ),
    }),
  );

  return (
    <SupplierInvoicesClient
      invoices={invoices}
      suppliers={suppliers}
      grns={grns}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
      initialGroups={page?.groups ?? []}
      initialTotalCount={page?.totalCount ?? 0}
      filters={filters}
      branchId={branchFilter}
      canPaySupplier={canPaySupplier}
      eyebrow={copy.eyebrow}
      description={copy.description}
    />
  );
}
