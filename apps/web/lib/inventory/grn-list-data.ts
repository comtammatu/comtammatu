import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { fetchGrns } from "@/(protected)/inventory/procurement-actions";
import { listMyGrnDrafts } from "@/(protected)/inventory/grn-actions";
import { formatDate } from "@lib/inventory/format";
import { isGrnBaselineReviewRequired } from "./grn-quality";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import type { GrnDraftRow, GrnRow } from "./grn-list-model";

type NamedRelation = {
  id?: number;
  name?: string | null;
  po_number?: string | null;
};

type GrnLineRow = {
  id?: number;
  received_quantity?: number | null;
  rejected_quantity?: number | null;
  unit_cost?: number | null;
  quality_status?: string | null;
  requires_review?: boolean | null;
  baseline_variance_pct?: number | null;
};

type GrnDbRow = {
  id: number;
  grn_number: string | null;
  status: string | null;
  received_date: string | null;
  supplier_id: number;
  branch_id: number;
  po_id: number | null;
  updated_at: string;
  branches: NamedRelation | NamedRelation[] | null;
  suppliers: NamedRelation | NamedRelation[] | null;
  purchase_orders: NamedRelation | NamedRelation[] | null;
  grn_items: GrnLineRow[] | null;
};

export type GrnListPageData = {
  branchId: number | null;
  canCreate: boolean;
  drafts: GrnDraftRow[];
  draftsLoadFailed: boolean;
  grns: GrnRow[];
  grnsLoadFailed: boolean;
};

type LoadGrnListPageDataOptions = {
  includeDrafts?: boolean;
  queryBranchId?: string | string[];
  routeBranchId?: number;
};

function countQcIssues(items: GrnLineRow[] | null): number {
  return (items ?? []).filter(
    (item) =>
      item.quality_status !== "accepted" ||
      item.requires_review === true ||
      isGrnBaselineReviewRequired(
        item.baseline_variance_pct == null
          ? null
          : Number(item.baseline_variance_pct),
      ),
  ).length;
}

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapGrnRows(rows: GrnDbRow[]): GrnRow[] {
  return rows.map((row) => {
    const supplier = relatedOne(row.suppliers);
    const branch = relatedOne(row.branches);
    const purchaseOrder = relatedOne(row.purchase_orders);
    const total = (row.grn_items ?? []).reduce(
      (sum, item) =>
        sum +
        (Number(item.received_quantity ?? 0) -
          Number(item.rejected_quantity ?? 0)) *
          Number(item.unit_cost ?? 0),
      0,
    );

    return {
      id: row.id,
      code: row.grn_number ?? "",
      supplierName: supplier?.name ?? "—",
      branchName: branch?.name ?? `#${row.branch_id}`,
      poId: row.po_id != null ? Number(row.po_id) : null,
      poCode: purchaseOrder?.po_number ?? "—",
      date: row.received_date ? formatDate(row.received_date) : "—",
      total,
      status: row.status ?? "pending",
      qcIssueCount: countQcIssues(row.grn_items),
    };
  });
}

function mapGrnDraftRows(rows: GrnDbRow[]): GrnDraftRow[] {
  return rows.map((row) => {
    const supplier = relatedOne(row.suppliers);
    const branch = relatedOne(row.branches);
    const purchaseOrder = relatedOne(row.purchase_orders);

    return {
      grnId: row.id,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      poId: row.po_id != null ? Number(row.po_id) : null,
      poCode: purchaseOrder?.po_number ?? null,
      supplierName: supplier?.name ?? "—",
      branchName: branch?.name ?? `#${row.branch_id}`,
      grnNumber: row.grn_number ?? "",
      updatedAt: row.updated_at,
      lineCount: row.grn_items?.length ?? 0,
      qcIssueCount: countQcIssues(row.grn_items),
    };
  });
}

export async function loadGrnListPageData({
  includeDrafts = true,
  queryBranchId,
  routeBranchId,
}: LoadGrnListPageDataOptions = {}): Promise<GrnListPageData> {
  const auth = await loadAuthState();
  const { supabase, claims } = auth;
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId,
  });
  if (scope.outOfScope) notFound();

  const branchId = scope.selectedBranchId;
  const canCreate = await probePermission(
    auth,
    PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
    branchId,
  );
  const shouldLoadDrafts = includeDrafts && canCreate;
  const [grnsResult, draftsResult] = await Promise.all([
    fetchGrns(branchId ?? undefined),
    shouldLoadDrafts ? listMyGrnDrafts(routeBranchId) : Promise.resolve(null),
  ]);

  const grnRows = grnsResult.success ? (grnsResult.data as GrnDbRow[]) : [];
  const draftRows =
    draftsResult?.success && draftsResult.data
      ? (draftsResult.data as GrnDbRow[])
      : [];

  return {
    branchId,
    canCreate,
    drafts: mapGrnDraftRows(draftRows),
    draftsLoadFailed:
      shouldLoadDrafts && draftsResult != null && !draftsResult.success,
    grns: mapGrnRows(grnRows),
    grnsLoadFailed: !grnsResult.success,
  };
}
