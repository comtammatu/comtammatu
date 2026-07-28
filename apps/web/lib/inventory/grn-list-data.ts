import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { fetchGrns } from "@/(protected)/inventory/procurement-actions";
import { listMyGrnDrafts } from "@/(protected)/inventory/grn-actions";
import { formatDate } from "@lib/inventory/format";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import {
  formatGrnListPoMeta,
  formatGrnListSupplierMeta,
  type GrnDraftRow,
  type GrnRow,
} from "./grn-list-model";
import { messages } from "@lib/messages";

const noValue = messages.inventory.common.noValue;

type NamedRelation = {
  id?: number;
  name?: string | null;
  po_number?: string | null;
  status?: string | null;
};

type GrnLineRow = {
  id?: number;
  rejected_quantity?: number | string | null;
  supplier_id?: number | null;
  suppliers?: NamedRelation | NamedRelation[] | null;
};

type GrnDbRow = {
  id: number;
  grn_number: string | null;
  status: string | null;
  received_date: string | null;
  supplier_id: number | null;
  branch_id: number;
  po_id: number | null;
  updated_at: string;
  branches: NamedRelation | NamedRelation[] | null;
  suppliers: NamedRelation | NamedRelation[] | null;
  purchase_orders: NamedRelation | NamedRelation[] | null;
  purchase_orders_source?: NamedRelation | NamedRelation[] | null;
  grn_items: GrnLineRow[] | null;
  supplier_invoices: Array<{ id?: number | null }> | null;
};

export type GrnListPageData = {
  branchId: number | null;
  canCreate: boolean;
  canManageSupplierInvoice: boolean;
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
  return (items ?? []).filter((item) => Number(item.rejected_quantity ?? 0) > 0)
    .length;
}

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function relatedMany<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function sourcePosFromRow(row: GrnDbRow): NamedRelation[] {
  // Reverse FK purchase_orders.source_grn_id → may arrive as array under
  // purchase_orders when both joins are requested with disambiguation.
  const fromAlias = relatedMany(row.purchase_orders_source);
  if (fromAlias.length > 0) return fromAlias;
  if (Array.isArray(row.purchase_orders)) {
    return row.purchase_orders.filter((po) => po.id != null);
  }
  return [];
}

function mapLineSuppliers(items: GrnLineRow[] | null) {
  return (items ?? []).flatMap((item) => {
    const supplier = relatedOne(item.suppliers);
    if (item.supplier_id == null || !supplier?.name) return [];
    return [
      {
        supplierId: item.supplier_id,
        supplierName: supplier.name,
      },
    ];
  });
}

function mapGrnRows(rows: GrnDbRow[]): GrnRow[] {
  return rows.map((row) => {
    const supplier = relatedOne(row.suppliers);
    const branch = relatedOne(row.branches);
    const legacyPo = relatedOne(
      Array.isArray(row.purchase_orders) ? null : row.purchase_orders,
    );
    const sourcePos = sourcePosFromRow(row);
    const poMeta = formatGrnListPoMeta({
      sourcePos,
      legacyPo: sourcePos.length > 0 ? null : legacyPo,
      fallback: noValue,
    });
    const invoice = relatedOne(row.supplier_invoices);
    const invoiceId =
      invoice?.id != null && Number.isSafeInteger(Number(invoice.id))
        ? Number(invoice.id)
        : null;
    return {
      id: row.id,
      code: row.grn_number ?? "",
      supplierName: formatGrnListSupplierMeta(
        mapLineSuppliers(row.grn_items),
        supplier?.name,
        noValue,
      ),
      branchName: branch?.name ?? `#${row.branch_id}`,
      poId: row.po_id != null ? Number(row.po_id) : (sourcePos[0]?.id ?? null),
      poCode: poMeta.poCode,
      poCount: poMeta.poCount,
      poStatus: poMeta.poStatus,
      invoiceId,
      date: row.received_date ? formatDate(row.received_date) : noValue,
      status: row.status ?? "pending",
      qcIssueCount: countQcIssues(row.grn_items),
    };
  });
}

function mapGrnDraftRows(rows: GrnDbRow[]): GrnDraftRow[] {
  return rows.map((row) => {
    const supplier = relatedOne(row.suppliers);
    const branch = relatedOne(row.branches);
    const legacyPo = relatedOne(
      Array.isArray(row.purchase_orders) ? null : row.purchase_orders,
    );
    const sourcePos = sourcePosFromRow(row);
    const poMeta = formatGrnListPoMeta({
      sourcePos,
      legacyPo: sourcePos.length > 0 ? null : legacyPo,
      fallback: noValue,
    });

    return {
      grnId: row.id,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      poId: row.po_id != null ? Number(row.po_id) : (sourcePos[0]?.id ?? null),
      poCode: poMeta.poCount > 0 ? poMeta.poCode : null,
      poCount: poMeta.poCount,
      poStatus: poMeta.poStatus,
      supplierName: formatGrnListSupplierMeta(
        mapLineSuppliers(row.grn_items),
        supplier?.name,
        noValue,
      ),
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
  const [canCreate, canManageSupplierInvoice] = await Promise.all([
    probePermission(auth, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE, branchId),
    probePermission(
      auth,
      PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
      branchId,
    ),
  ]);
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
    canManageSupplierInvoice,
    drafts: mapGrnDraftRows(draftRows),
    draftsLoadFailed:
      shouldLoadDrafts && draftsResult != null && !draftsResult.success,
    grns: mapGrnRows(grnRows),
    grnsLoadFailed: !grnsResult.success,
  };
}
