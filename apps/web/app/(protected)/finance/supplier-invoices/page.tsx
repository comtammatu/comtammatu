import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { messages } from "@lib/messages";
import { fetchGrnIdsForDropdown } from "../../inventory/procurement-actions";
import { fetchSuppliers } from "../../inventory/supplier-actions";
import {
  fetchSupplierInvoicesPage,
  type SupplierInvoiceCursor,
} from "../supplier-invoice-actions";
import { resolveRequestedBranchId } from "../../inventory/_lib/inventory-scope";
import { SupplierInvoicesClient } from "./supplier-invoices-client";
import { parseSupplierInvoiceListFilters } from "./supplier-invoice-list-model";
import { mapSupplierInvoiceRow } from "./supplier-invoice-row";

export default async function FinanceSupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    branchId?: string | string[];
    invoiceId?: string | string[];
    grnId?: string | string[];
    mode?: string | string[];
    q?: string | string[];
    supplierId?: string | string[];
    matchStatus?: string | string[];
    paymentStatus?: string | string[];
    overdue?: string | string[];
    vat?: string | string[];
    view?: string | string[];
  }>;
}) {
  const copy = messages.finance.supplierInvoicesPage;
  const renderMissingInvoice = () => (
    <AppPage width="xwide" density="compact">
      <AppPageHeader title={copy.title} description={copy.description} />
      <AppEmptyState
        mode="no-data"
        title={copy.notFoundTitle}
        description={copy.notFoundDescription}
      />
    </AppPage>
  );
  const [
    authState,
    canReadProcurement,
    hasPayPermission,
    hasInvoiceCreatePermission,
    hasInvoiceMatchPermission,
  ] = await Promise.all([
    loadAuthState(),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_AP_PAY),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_INVOICE_MATCH),
  ]);
  const isOwner = authState.claims.user_role === "owner";
  const canPaySupplier = isOwner && hasPayPermission;
  const canAttachVatEvidence =
    hasPayPermission || hasInvoiceCreatePermission;

  if (!canReadProcurement) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={copy.title} description={copy.description} />
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

  const rawGrnId = Array.isArray(params.grnId) ? params.grnId[0] : params.grnId;
  const parsedGrnId =
    typeof rawGrnId === "string" && /^\d+$/.test(rawGrnId)
      ? Number(rawGrnId)
      : null;
  const includeGrnId =
    parsedGrnId != null && Number.isSafeInteger(parsedGrnId) && parsedGrnId > 0
      ? parsedGrnId
      : undefined;

  const [res, suppliersRes, grnsRes, requestedInvoiceRes] = await Promise.all([
    fetchSupplierInvoicesPage({
      branchId: branchFilter,
      query: filters.query,
      supplierId: filters.supplierId ?? undefined,
      matchStatus: filters.matchStatus ?? undefined,
      paymentStatus: filters.paymentStatus ?? undefined,
      overdueOnly: filters.overdueOnly,
      vatEvidence: filters.vatEvidence ?? undefined,
      viewMode: filters.viewMode,
    }),
    fetchSuppliers(),
    fetchGrnIdsForDropdown(branchFilter, includeGrnId, requestedInvoiceId ?? undefined),
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
        <AppPageHeader title={copy.title} description={copy.description} />
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
    (row) => {
      const rawNet = row.net_accepted_amount;
      const netAcceptedAmount =
        typeof rawNet === "number" && Number.isFinite(rawNet)
          ? rawNet
          : rawNet != null &&
              Number.isFinite(Number(rawNet)) &&
              String(rawNet).trim() !== ""
            ? Number(rawNet)
            : null;
      const id = Number(row.id ?? 0);
      const supplierId = Number(row.supplier_id ?? 0);
      const rawPoId = row.po_id;
      const poId =
        rawPoId != null &&
        Number.isSafeInteger(Number(rawPoId)) &&
        Number(rawPoId) > 0
          ? Number(rawPoId)
          : null;
      return {
        optionKey: `${id}:${supplierId}`,
        id,
        code: String(row.grn_number ?? "—"),
        supplierId,
        supplierName: String(
          ((row.suppliers as Record<string, unknown> | null)?.name as string) ??
            "—",
        ),
        poId,
        netAcceptedAmount,
        lines: (
          (row.lines as Array<Record<string, unknown>> | undefined) ?? []
        ).map((line) => ({
          grnItemId: Number(line.grn_item_id),
          purchaseOrderItemId: Number(line.purchase_order_item_id),
          ingredientId: Number(line.ingredient_id),
          ingredientName: String(line.ingredient_name ?? "Nguyên liệu"),
          unitId: Number(line.entry_unit_id),
          unitLabel: String(line.unit_label ?? "Đơn vị"),
          availableQuantity: Number(line.available_quantity),
        })),
      };
    },
  );

  return (
    <SupplierInvoicesClient
      invoices={invoices}
      suppliers={suppliers}
      grns={grns}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
      initialGroups={page?.groups ?? []}
      initialAdvances={page?.advances ?? []}
      initialTotalCount={page?.totalCount ?? 0}
      filters={filters}
      branchId={branchFilter}
      tenantId={authState.claims.tenant_id}
      canCreateInvoice={hasInvoiceCreatePermission}
      canPaySupplier={canPaySupplier}
      canAttachVatEvidence={canAttachVatEvidence}
      canAcceptDiscrepancy={hasInvoiceMatchPermission}
      description={copy.description}
    />
  );
}
