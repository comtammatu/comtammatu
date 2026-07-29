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
  const poSelect = monetaryAccess.purchasePrice
    ? "id, po_number, display_id, status, ordered_at, expected_delivery_date, notes, supplier_id, branch_id, source_grn_id, purchase_request_id, purchase_requests(request_number), purchase_order_items(id, quantity, unit_price_est, line_total, ingredients(name), units!purchase_order_items_entry_unit_id_fkey(code, name)), goods_received_notes!goods_received_notes_po_id_fkey(id, grn_number, status, received_date), source_grn:goods_received_notes!purchase_orders_source_grn_id_fkey(id, grn_number, status, received_date)"
    : "id, po_number, display_id, status, ordered_at, expected_delivery_date, notes, supplier_id, branch_id, source_grn_id, purchase_request_id, purchase_requests(request_number), purchase_order_items(id, quantity, ingredients(name), units!purchase_order_items_entry_unit_id_fkey(code, name)), goods_received_notes!goods_received_notes_po_id_fkey(id, grn_number, status, received_date), source_grn:goods_received_notes!purchase_orders_source_grn_id_fkey(id, grn_number, status, received_date)";
  let poQuery = poReadClient
    .from("purchase_orders")
    .select(poSelect as never)
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false })
    .limit(100);
  if (scope.selectedBranchId != null) {
    poQuery = poQuery.eq("branch_id", scope.selectedBranchId);
  }

  const [
    poResult,
    supplierResult,
    procurementBranches,
    canCreate,
    canApprove,
    canReceive,
  ] =
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
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
    ]);

  if (poResult.error || supplierResult.error) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader
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
  const rawPurchaseOrders = (poResult.data ?? []) as unknown as Array<{
    id: number;
    po_number: string;
    display_id: string | null;
    status: string;
    ordered_at: string;
    expected_delivery_date: string | null;
    notes: string | null;
    supplier_id: number;
    branch_id: number;
    source_grn_id: number | null;
    purchase_request_id: number | null;
    purchase_requests:
      | { request_number: string }
      | { request_number: string }[]
      | null;
    purchase_order_items: Array<{
      id: number;
      quantity: number | string;
      unit_price_est?: number | string | null;
      line_total?: number | string | null;
      ingredients: { name: string } | null;
      units: { code: string; name: string | null } | null;
    }>;
    goods_received_notes: Array<{
      id: number;
      grn_number: string;
      status: string;
      received_date: string | null;
    }>;
    source_grn:
      | {
          id: number;
          grn_number: string;
          status: string;
          received_date: string | null;
        }
      | Array<{
          id: number;
          grn_number: string;
          status: string;
          received_date: string | null;
        }>
      | null;
  }>;
  const rows: PurchaseOrderRow[] = rawPurchaseOrders.map((po) => {
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
    const sourceGrnRaw = po.source_grn;
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
    const request = Array.isArray(po.purchase_requests)
      ? po.purchase_requests[0]
      : po.purchase_requests;
    return {
      id: po.id,
      code: po.display_id ?? po.po_number,
      status: po.status,
      orderedAt: po.ordered_at,
      expectedDeliveryDate: po.expected_delivery_date,
      notes: po.notes,
      purchaseRequestId: po.purchase_request_id,
      purchaseRequestCode: request?.request_number ?? null,
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
      activeDraftGrnId:
        linkedGrns.find((grn) => grn.status === "draft")?.id ?? null,
    };
  });

  return (
    <PurchaseOrdersClient
      rows={rows}
      canCreate={canCreate && monetaryAccess.purchasePrice}
      canApprove={canApprove && monetaryAccess.purchasePrice}
      canReceive={canReceive}
      canViewPrices={monetaryAccess.purchasePrice}
      initialPoId={initialPoId}
    />
  );
}
