import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchProcurementBranches } from "../_lib/procurement-branches";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import {
  PurchaseOrdersClient,
  type PurchaseOrderRow,
} from "./purchase-orders-client";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[]; poId?: string | string[] }>;
}) {
  const params = await searchParams;
  const copy = messages.inventory.po;
  const rawPoId = Array.isArray(params.poId) ? params.poId[0] : params.poId;
  const initialPoId =
    rawPoId != null && /^\d+$/.test(rawPoId) ? Number(rawPoId) : null;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();

  const monetaryAccess = await loadInventoryMonetaryAccess(claims.user_role);
  const poReadClient = monetaryAccess.purchasePrice
    ? (monetaryAccess.client ?? supabase)
    : supabase;
  let poQuery = poReadClient
    .from("purchase_orders")
    .select(
      monetaryAccess.purchasePrice
        ? "id, po_number, display_id, status, ordered_at, notes, supplier_id, branch_id, source_grn_id, purchase_order_items(id, quantity, unit_price_est, line_total, ingredients(name), units!purchase_order_items_entry_unit_id_fkey(code, name)), goods_received_notes!goods_received_notes_po_id_fkey(id, grn_number, status, received_date), source_grn:goods_received_notes!purchase_orders_source_grn_id_fkey(id, grn_number, status, received_date)"
        : "id, po_number, display_id, status, ordered_at, notes, supplier_id, branch_id, source_grn_id, purchase_order_items(id, quantity, ingredients(name), units!purchase_order_items_entry_unit_id_fkey(code, name)), goods_received_notes!goods_received_notes_po_id_fkey(id, grn_number, status, received_date), source_grn:goods_received_notes!purchase_orders_source_grn_id_fkey(id, grn_number, status, received_date)",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false })
    .limit(100);
  if (scope.selectedBranchId != null) {
    poQuery = poQuery.eq("branch_id", scope.selectedBranchId);
  }

  const [poResult, supplierResult, procurementBranches, canCreate, canApprove] =
    await Promise.all([
      poQuery,
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name"),
      fetchProcurementBranches(supabase, claims.tenant_id),
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PO_APPROVE),
    ]);

  if (poResult.error || supplierResult.error) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={copy.pageTitle}
        />
        <AppEmptyState
          mode="error"
          title={copy.loadErrorTitle}
          description={copy.loadErrorDescription}
        />
      </AppPage>
    );
  }

  const branchNames = new Map(
    procurementBranches.map((branch) => [branch.id, branch.name]),
  );
  const suppliers = supplierResult.data ?? [];
  const supplierNames = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  const rows: PurchaseOrderRow[] = (poResult.data ?? []).map((po) => {
    const lines = (po.purchase_order_items ?? []).map((line) => {
      const ingredient = line.ingredients as { name: string } | null;
      const unit = line.units as { code: string; name: string | null } | null;
      return {
        id: line.id,
        ingredientName: ingredient?.name ?? "Nguyên liệu",
        quantity: Number(line.quantity),
        unitLabel: unit?.name ?? unit?.code ?? "Đơn vị",
        monetary:
          monetaryAccess.purchasePrice &&
          "unit_price_est" in line &&
          "line_total" in line
            ? {
                unitPriceEst:
                  line.unit_price_est == null
                    ? null
                    : Number(line.unit_price_est),
                lineTotal:
                  line.line_total == null ? null : Number(line.line_total),
              }
            : null,
      };
    });
    const totals = lines.flatMap((line) =>
      line.monetary?.lineTotal == null ? [] : [line.monetary.lineTotal],
    );
    const linkedByPoId = (po.goods_received_notes ?? []).map((grn) => ({
      id: grn.id,
      code: grn.grn_number,
      status: grn.status,
      receivedAt: grn.received_date,
    }));
    const sourceGrnRaw = (po as { source_grn?: {
      id: number;
      grn_number: string;
      status: string;
      received_date: string | null;
    } | {
      id: number;
      grn_number: string;
      status: string;
      received_date: string | null;
    }[] | null }).source_grn;
    const sourceGrn = Array.isArray(sourceGrnRaw)
      ? sourceGrnRaw[0]
      : sourceGrnRaw;
    const linkedGrns =
      sourceGrn != null
        ? [
            {
              id: sourceGrn.id,
              code: sourceGrn.grn_number,
              status: sourceGrn.status,
              receivedAt: sourceGrn.received_date,
            },
            ...linkedByPoId.filter((grn) => grn.id !== sourceGrn.id),
          ]
        : linkedByPoId;
    return {
      id: po.id,
      code: po.display_id ?? po.po_number,
      status: po.status,
      orderedAt: po.ordered_at,
      notes: po.notes,
      supplierName:
        supplierNames.get(po.supplier_id) ?? copy.supplierRequired,
      branchName: branchNames.get(po.branch_id) ?? copy.branchLabel,
      lineCount: lines.length,
      monetary: monetaryAccess.purchasePrice
        ? {
            estimatedTotal:
              totals.length > 0
                ? totals.reduce((sum, amount) => sum + amount, 0)
                : null,
          }
        : null,
      lines,
      linkedGrns,
    };
  });

  return (
    <PurchaseOrdersClient
      rows={rows}
      canCreate={canCreate && monetaryAccess.purchasePrice}
      canApprove={canApprove && monetaryAccess.purchasePrice}
      canViewPrices={monetaryAccess.purchasePrice}
      initialPoId={initialPoId}
    />
  );
}
