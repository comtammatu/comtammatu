import { notFound } from "next/navigation";
import { PROCUREMENT_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { currentUserHasPermission } from "@/_lib/permissions";
import { messages } from "@lib/messages";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { fetchIngredients } from "../../ingredient-actions";
import { fetchGrnDetail } from "../../procurement-actions";
import { fetchQcSettings, type QcSettings } from "../../_lib/qc-settings";
import { formatDate } from "../../_lib/format";
import { getIngredientUnitDisplayName } from "../../_lib/unit-display";
import { tRoute } from "../../_lib/dictionary";
import { fetchEntityAuditLogs, type AuditLogRow } from "@/_lib/audit";
import { GRNDetailClient } from "./grn-detail-client";
import type { GRNDetail } from "./grn-detail-client";
import type { IngredientRow } from "../../page";

interface GRNDetailPageContentProps {
  grnId: number | string;
  routeBranchId?: number;
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  purchaseOrdersBasePath?: string;
  supplierInvoicesBasePath?: string;
}

export interface GrnDetailData {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  auditLogs: AuditLogRow[];
  canAdjustStock: boolean;
  canAmendConfirmed: boolean;
}

type GrnDetailLoadResult =
  | { data: GrnDetailData; error?: never }
  | { data: null; error?: string; notFound?: boolean };

async function loadGrnDetailResult(
  grnId: number | string,
  routeBranchId?: number,
): Promise<GrnDetailLoadResult> {
  const [res, ingredientsRes] = await Promise.all([
    fetchGrnDetail(grnId),
    fetchIngredients(),
  ]);
  if (!res.success || !res.data) {
    return {
      data: null,
      error: res.error,
      notFound: res.errorCode === "not_found",
    };
  }

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
      id: number;
      grn_number: string;
      status: string;
      received_date: string | null;
      branch_id: number;
      supplier_id: number;
      branches: { id: number; name: string } | null;
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
      entry_unit_id: number | null;
      unit_cost: number;
      total_cost: number;
      quality_status: string;
      receiving_temperature: number | null;
      ingredients: {
        id: number;
        name: string;
        ingredient_units?: { is_base: boolean; units: { code: string } | null }[];
      } | null;
    }>;
    invoiceId: number | null;
  };

  if (routeBranchId != null && d.grn.branch_id !== routeBranchId) {
    return { data: null, notFound: true };
  }

  const supplier = d.grn.suppliers as { id: number; name: string } | null;
  const branch = d.grn.branches as { id: number; name: string } | null;
  const po = d.grn.purchase_orders as {
    id: number;
    po_number: string;
  } | null;
  const catalogIngredients = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];
  const ingredientById = new Map(
    catalogIngredients.map((ingredient) => [ingredient.id, ingredient]),
  );

  const items: GRNDetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      ingredient_units?: { is_base: boolean; units: { code: string } | null }[];
    } | null;

    const qsMap: Record<string, string> = {
      accepted: "pass",
      rejected: "warning",
      partial: "warning",
    };

    const delivered = Number(l.received_quantity ?? 0);
    const rejected = Number(l.rejected_quantity ?? 0);
    const entryUnitId = l.entry_unit_id ?? null;
    const catalogIngredient = ingredientById.get(l.ingredient_id ?? ing?.id ?? 0);
    const fallbackUnit =
      l.unit ||
      ing?.ingredient_units?.find((u) => u.is_base)?.units?.code ||
      "";

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
      unit: getIngredientUnitDisplayName(
        catalogIngredient?.units,
        entryUnitId,
        fallbackUnit,
      ),
      entryUnitId,
      cost: Number(l.unit_cost ?? 0),
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
    id: d.grn.id,
    tenantId: ctx?.claims.tenant_id ?? 0,
    code: d.grn.grn_number ?? "",
    poCode: po?.po_number ?? "",
    poId: po?.id,
    invoiceId: d.invoiceId ?? null,
    branchId: d.grn.branch_id,
    branchName: branch?.name ?? `#${d.grn.branch_id}`,
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

  const canAdjustStock = await currentUserHasPermission(
    d.grn.branch_id,
    PERMISSION_KEYS.INVENTORY_WRITE,
  );
  const canAmendConfirmed = await currentUserHasPermission(
    d.grn.branch_id,
    PERMISSION_KEYS.PROCUREMENT_GRN_AMEND,
  );

  return {
    data: {
      grn,
      ingredients: catalogIngredients,
      auditLogs: await fetchEntityAuditLogs("goods_receipt_note", d.grn.id, 50),
      canAdjustStock,
      canAmendConfirmed,
    },
  };
}

export async function loadGrnDetail(
  grnId: number | string,
  routeBranchId?: number,
): Promise<GrnDetailData | null> {
  const result = await loadGrnDetailResult(grnId, routeBranchId);
  return result.data;
}

export function isGrnLookupParam(value: string): boolean {
  if (/^\d+$/.test(value)) {
    const numericId = Number(value);
    return Number.isSafeInteger(numericId) && numericId > 0;
  }
  return /^GRN-[A-Za-z0-9_-]{1,60}$/.test(value);
}

function GrnDetailLoadError({ error }: { error: string }) {
  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={tRoute("/inventory/grn", "heading")}
      />
      <AppEmptyState
        mode="error"
        title={ERRORS_VI.loadFailed}
        description={error}
      />
    </AppPage>
  );
}

export async function GRNDetailPageContent({
  grnId,
  routeBranchId,
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  supplierInvoicesBasePath = "/inventory/supplier-invoices",
}: GRNDetailPageContentProps) {
  const result = await loadGrnDetailResult(grnId, routeBranchId);
  if (!result.data) {
    if (result.error && !result.notFound) {
      return <GrnDetailLoadError error={result.error} />;
    }
    notFound();
  }

  return (
    <GRNDetailClient
      grn={result.data.grn}
      ingredients={result.data.ingredients}
      canAdjustStock={result.data.canAdjustStock}
      canAmendConfirmed={result.data.canAmendConfirmed}
      auditLogs={result.data.auditLogs}
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
  if (!isGrnLookupParam(id)) notFound();
  return <GRNDetailPageContent grnId={id} />;
}
