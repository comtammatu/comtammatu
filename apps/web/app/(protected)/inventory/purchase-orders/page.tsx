import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  fetchPurchaseOrdersPage,
  fetchPurchaseOrderStatusCounts,
  fetchSuppliers,
} from "../procurement-actions";
import type { PurchaseOrderCursor } from "../procurement-actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
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
  const branchFilter =
    routeBranchId ?? (await resolveRequestedBranchId(params.branchId));

  if (routeBranchId != null) {
    const { supabase, claims } = await loadAuthState();
    const scope = await resolveInventoryBranchScope(
      supabase,
      claims,
      routeBranchId,
    );
    if (scope.selectedBranchId !== routeBranchId) notFound();
  }

  const [poRes, countsRes, supRes] = await Promise.all([
    fetchPurchaseOrdersPage({ branchId: branchFilter ?? undefined }),
    fetchPurchaseOrderStatusCounts(branchFilter ?? undefined),
    fetchSuppliers(),
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
