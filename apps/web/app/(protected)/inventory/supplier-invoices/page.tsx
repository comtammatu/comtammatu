import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import {
  fetchGrnIdsForDropdown,
  fetchSupplierInvoicesPage,
} from "../procurement-actions";
import type { SupplierInvoiceCursor } from "../procurement-actions";
import { fetchSuppliers } from "../supplier-actions";
import { resolveRequestedBranchId } from "../_lib/inventory-scope";
import { SupplierInvoicesClient } from "./supplier-invoices-client";
import { parseSupplierInvoiceListFilters } from "./supplier-invoice-list-model";
import { mapSupplierInvoiceRow } from "./supplier-invoice-row";

export default async function SupplierInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    q?: string | string[];
    supplierId?: string | string[];
    matchStatus?: string | string[];
    paymentStatus?: string | string[];
    overdue?: string | string[];
    view?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const branchFilter =
    (await resolveRequestedBranchId(params.branchId)) ?? undefined;
  const filters = parseSupplierInvoiceListFilters(params);

  const [res, suppliersRes, grnsRes, authState, hasPayPermission] =
    await Promise.all([
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
      loadAuthState(),
      currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_AP_PAY),
    ]);
  const canPaySupplier =
    authState.claims.user_role === "owner" && hasPayPermission;
  const page = res.success
    ? res.data
    : {
        items: [],
        hasMore: false,
        nextCursor: null,
        totalCount: 0,
        groups: [],
      };
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
      initialGroups={page?.groups ?? []}
      initialTotalCount={page?.totalCount ?? 0}
      filters={filters}
      branchId={branchFilter}
      canPaySupplier={canPaySupplier}
    />
  );
}
