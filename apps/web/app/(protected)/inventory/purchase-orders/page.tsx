import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchPurchaseOrders, fetchSuppliers } from "../procurement-actions";
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
}

export async function PurchaseOrdersPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/purchase-orders",
  suppliersPath = "/inventory/suppliers",
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

  const [poRes, supRes] = await Promise.all([
    fetchPurchaseOrders(branchFilter ?? undefined),
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
      purchaseOrdersBasePath={basePath}
      suppliersPath={suppliersPath}
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
