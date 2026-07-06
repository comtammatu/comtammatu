import { notFound, redirect } from "next/navigation";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { fetchGrns } from "../procurement-actions";
import { listMyGrnDrafts } from "../grn-actions";
import { formatDate } from "../_lib/format";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { GrnListClient } from "./grn-list-client";
import type { GrnRow, GrnDraftRow } from "./grn-list-client";

interface GRNListPageContentProps {
  searchParams: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  purchaseOrdersPath?: string;
  showDrafts?: boolean;
  embedded?: boolean;
}

export async function GRNListPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/grn",
  purchaseOrdersPath = "/inventory/purchase-orders",
  showDrafts = true,
  embedded = false,
}: GRNListPageContentProps) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  const canCreate = PROCUREMENT_ROLES.includes(claims.user_role);
  const branchId = scope.selectedBranchId;
  const [res, draftsRes] = await Promise.all([
    fetchGrns(branchId ?? undefined),
    // Scope drafts by the hard operator route branch only — the office plane
    // (routeBranchId undefined) keeps its cross-branch drafts view.
    showDrafts ? listMyGrnDrafts(routeBranchId) : Promise.resolve(null),
  ]);
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const grns: GrnRow[] = dbRows.map((row) => ({
    id: row.id as number,
    code: (row.grn_number as string) ?? "",
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
    branchName:
      ((row.branches as Record<string, unknown>)?.name as string) ??
      `#${row.branch_id as number}`,
    poId: row.po_id != null ? Number(row.po_id) : null,
    poCode:
      ((row.purchase_orders as Record<string, unknown>)?.po_number as string) ??
      "—",
    date: row.received_date ? formatDate(row.received_date as string) : "—",
    // Total received value = (delivered − rejected) × unit_cost (net into stock)
    total: (
      (row.grn_items as Array<{
        received_quantity: number | null;
        rejected_quantity: number | null;
        unit_cost: number | null;
      }>) ?? []
    ).reduce(
      (sum, item) =>
        sum +
        (Number(item.received_quantity ?? 0) -
          Number(item.rejected_quantity ?? 0)) *
          Number(item.unit_cost ?? 0),
      0,
    ),
    status: (row.status as string) ?? "pending",
  }));

  const draftDbRows =
    draftsRes?.success && draftsRes.data
      ? (draftsRes.data as Array<Record<string, unknown>>)
      : [];
  const drafts: GrnDraftRow[] = draftDbRows.map((row) => ({
    grnId: row.id as number,
    supplierId: row.supplier_id as number,
    supplierName:
      ((row.suppliers as Record<string, unknown>)?.name as string) ?? "—",
    branchName:
      ((row.branches as Record<string, unknown>)?.name as string) ??
      `#${row.branch_id as number}`,
    grnNumber: (row.grn_number as string) ?? "",
    updatedAt: row.updated_at as string,
    lineCount: (row.grn_items as Array<{ id: number }> | null)?.length ?? 0,
  }));

  return (
    <GrnListClient
      grns={grns}
      basePath={basePath}
      purchaseOrdersPath={purchaseOrdersPath}
      drafts={showDrafts ? drafts : undefined}
      embedded={embedded}
      canCreate={canCreate}
    />
  );
}

export default async function GRNListPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const qParams = new URLSearchParams();
  qParams.set("tab", "grn");
  if (params.branchId) {
    if (Array.isArray(params.branchId)) {
      params.branchId.forEach((id) => qParams.append("branchId", id));
    } else {
      qParams.set("branchId", params.branchId);
    }
  }
  redirect(`/inventory/operations?${qParams.toString()}`);
}
