import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  fetchPoSuggestions,
  fetchPurchaseOrdersPage,
  fetchPurchaseOrderStatusCounts,
  fetchSuppliers,
} from "../procurement-actions";
import type { PurchaseOrderCursor } from "../procurement-actions";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import {
  PurchaseOrdersClient,
  type PurchaseOrderRow,
} from "./purchase-orders-client";
import type { SupplierRow } from "../suppliers/suppliers-client";

interface PurchaseOrdersPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  suppliersPath?: string | null;
  embedded?: boolean;
}

export async function PurchaseOrdersPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/purchase-orders",
  suppliersPath = "/inventory/suppliers",
  embedded = false,
}: PurchaseOrdersPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  const branchFilter = scope.selectedBranchId;

  // Reorder-suggestion CTA needs one concrete procurement branch: the
  // resolved list-scope branch when set, else the caller's own branch for
  // branch-scoped roles, else the tenant's first procurement branch.
  const procBranches = await fetchProcurementBranches(
    supabase,
    claims.tenant_id,
  );
  const isBranchScopedProcurement =
    claims.user_role === "warehouse_manager" ||
    claims.user_role === "production_manager";
  const suggestionsBranchId =
    branchFilter ??
    (isBranchScopedProcurement ? claims.branch_id : null) ??
    procBranches[0]?.id ??
    null;

  const [poRes, countsRes, supRes, suggestionsRes] = await Promise.all([
    fetchPurchaseOrdersPage({ branchId: branchFilter ?? undefined }),
    fetchPurchaseOrderStatusCounts(branchFilter ?? undefined),
    fetchSuppliers(),
    suggestionsBranchId
      ? fetchPoSuggestions({ branchId: suggestionsBranchId, periodDays: 7 })
      : Promise.resolve({ success: true as const, data: [] }),
  ]);

  const page = poRes.success
    ? poRes.data
    : { items: [], hasMore: false, nextCursor: null };
  const rows: PurchaseOrderRow[] = (page?.items ?? []) as PurchaseOrderRow[];
  const initialHasMore = page?.hasMore ?? false;
  const initialNextCursor = (page?.nextCursor ??
    null) as PurchaseOrderCursor | null;

  const statusCounts: Record<string, number> = countsRes.success
    ? (countsRes.data ?? {})
    : {};

  const suppliers: SupplierRow[] = supRes.success
    ? ((supRes.data ?? []) as SupplierRow[])
    : [];

  const suggestionsCount = suggestionsRes.success
    ? ((suggestionsRes.data ?? []) as Array<{ below_reorder: boolean }>)
        .filter((s) => s.below_reorder).length
    : 0;

  return (
    <PurchaseOrdersClient
      initial={rows}
      suppliers={suppliers}
      statusCounts={statusCounts}
      initialHasMore={initialHasMore}
      initialNextCursor={initialNextCursor}
      branchId={branchFilter ?? undefined}
      purchaseOrdersBasePath={basePath}
      suppliersPath={suppliersPath}
      embedded={embedded}
      reorderSuggestionsCount={suggestionsCount}
      reorderSuggestionsBranchId={suggestionsBranchId}
    />
  );
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  return <PurchaseOrdersPageContent searchParams={searchParams} />;
}
