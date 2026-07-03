import { notFound } from "next/navigation";
import { PROCUREMENT_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { fetchIngredients } from "../../ingredient-actions";
import { fetchGrnDetail } from "../../procurement-actions";
import { fetchQcSettings, type QcSettings } from "../../_lib/qc-settings";
import { formatDate } from "../../_lib/format";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { GRNDetailClient } from "./grn-detail-client";
import type { GRNDetail } from "./grn-detail-client";
import type { IngredientRow } from "../../page";

interface GRNDetailPageContentProps {
  grnId: number;
  routeBranchId?: number;
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  purchaseOrdersBasePath?: string;
  supplierInvoicesBasePath?: string;
}

export async function GRNDetailPageContent({
  grnId,
  routeBranchId,
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  supplierInvoicesBasePath = "/inventory/supplier-invoices",
}: GRNDetailPageContentProps) {
  const [res, ingredientsRes, auditLogs] = await Promise.all([
    fetchGrnDetail(grnId),
    fetchIngredients(),
    fetchEntityAuditLogs("goods_receipt_note", grnId, 50),
  ]);
  if (!res.success || !res.data) notFound();

  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  const qcSettings: QcSettings = ctx
    ? await fetchQcSettings(ctx.supabase, ctx.claims.tenant_id)
    : {
        qty_short_tolerance_pct: 5,
        price_variance_warn_pct: 5,
        price_variance_review_pct: 15,
        reject_requires_photo: true,
      };

  const d = res.data as {
    grn: {
      grn_number: string;
      status: string;
      received_date: string | null;
      branch_id: number;
      supplier_id: number;
      suppliers: { id: number; name: string } | null;
      purchase_orders: { id: number; po_number: string } | null;
    };
    lines: Array<{
      id: number;
      ingredient_id: number;
      po_quantity: number | null;
      po_unit_price: number | null;
      received_quantity: number;
      rejected_quantity: number | null;
      rejection_reason: string | null;
      rejected_photo_url: string | null;
      price_override_note: string | null;
      price_override_photo_url: string | null;
      price_variance_pct: number | null;
      requires_review: boolean | null;
      short_delivery_action: string | null;
      unit: string;
      unit_cost: number;
      total_cost: number;
      quality_status: string;
      receiving_temperature: number | null;
      batch_number: string | null;
      expiry_date: string | null;
      ingredients: {
        id: number;
        name: string;
        unit: string;
        purchase_unit: string | null;
      } | null;
    }>;
    invoiceId: number | null;
  };

  if (routeBranchId != null && d.grn.branch_id !== routeBranchId) notFound();

  const supplier = d.grn.suppliers as { id: number; name: string } | null;
  const po = d.grn.purchase_orders as {
    id: number;
    po_number: string;
  } | null;

  const items: GRNDetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
      purchase_unit: string | null;
    } | null;

    const qsMap: Record<string, string> = {
      accepted: "pass",
      rejected: "warning",
      partial: "warning",
    };

    const delivered = Number(l.received_quantity ?? 0);
    const rejected = Number(l.rejected_quantity ?? 0);

    return {
      lineId: l.id,
      ingredientId: l.ingredient_id,
      name: ing?.name ?? "—",
      sku: "",
      poQuantity: l.po_quantity != null ? Number(l.po_quantity) : null,
      poUnitPrice: l.po_unit_price != null ? Number(l.po_unit_price) : null,
      required: Number(l.po_quantity ?? l.received_quantity ?? 0),
      actual: delivered,
      accepted: delivered - rejected,
      rejected,
      rejectionReason: l.rejection_reason ?? "",
      rejectedPhotoUrl: l.rejected_photo_url ?? "",
      priceOverrideNote: l.price_override_note ?? "",
      priceOverridePhotoUrl: l.price_override_photo_url ?? "",
      priceVariancePct:
        l.price_variance_pct != null ? Number(l.price_variance_pct) : null,
      requiresReview: Boolean(l.requires_review),
      shortDeliveryAction:
        l.short_delivery_action === "accept_and_close" ||
        l.short_delivery_action === "wait_backorder"
          ? l.short_delivery_action
          : null,
      unit: ing?.purchase_unit || l.unit || ing?.unit || "",
      cost: Number(l.unit_cost ?? 0),
      lot: l.batch_number ?? "",
      expiry: l.expiry_date ?? "",
      expiryDisplay: l.expiry_date ? formatDate(l.expiry_date) : "—",
      temp:
        l.receiving_temperature != null ? `${l.receiving_temperature}°C` : null,
      qualityStatus:
        (l.quality_status as "accepted" | "rejected" | "partial") ?? "accepted",
      status: qsMap[l.quality_status] ?? "pass",
    };
  });

  // Total received value = cost × accepted (net into stock after supplier returns)
  const totalAmount = items.reduce((sum, i) => sum + i.cost * i.accepted, 0);

  const grn: GRNDetail = {
    id: grnId,
    tenantId: ctx?.claims.tenant_id ?? 0,
    code: d.grn.grn_number ?? "",
    poCode: po?.po_number ?? "",
    poId: po?.id,
    invoiceId: d.invoiceId ?? null,
    branchId: d.grn.branch_id,
    supplierId: d.grn.supplier_id,
    supplier: supplier?.name ?? "—",
    date: d.grn.received_date ? formatDate(d.grn.received_date) : "—",
    total: totalAmount,
    tax: 0,
    status: d.grn.status ?? "draft",
    items,
    qcSettings: {
      qtyShortTolerancePct: qcSettings.qty_short_tolerance_pct,
      priceVarianceWarnPct: qcSettings.price_variance_warn_pct,
      priceVarianceReviewPct: qcSettings.price_variance_review_pct,
      rejectRequiresPhoto: qcSettings.reject_requires_photo,
    },
  };

  const ingredients: IngredientRow[] = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];
  const canAdjustStock = await currentUserHasPermission(
    d.grn.branch_id,
    PERMISSION_KEYS.INVENTORY_WRITE,
  );
  const canAmendConfirmed = await currentUserHasPermission(
    d.grn.branch_id,
    PERMISSION_KEYS.PROCUREMENT_GRN_AMEND,
  );

  return (
    <GRNDetailClient
      grn={grn}
      ingredients={ingredients}
      canAdjustStock={canAdjustStock}
      canAmendConfirmed={canAmendConfirmed}
      auditLogs={auditLogs}
      grnListBasePath={grnListBasePath}
      grnMobileBackPath={grnMobileBackPath}
      purchaseOrdersBasePath={purchaseOrdersBasePath}
      supplierInvoicesBasePath={supplierInvoicesBasePath}
    />
  );
}

export default async function GRNDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GRNDetailPageContent grnId={Number(id)} />;
}
