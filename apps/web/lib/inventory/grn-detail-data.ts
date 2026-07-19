import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { fetchEntityAuditLogs, type AuditLogRow } from "@/_lib/audit";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { formatDate } from "@lib/inventory/format";
import { fetchProcurementBranches } from "@/(protected)/inventory/_lib/procurement-branches";
import {
  fetchQcSettings,
  type QcSettings,
} from "@/(protected)/inventory/_lib/qc-settings";
import { getIngredientUnitDisplayName } from "@/(protected)/inventory/_lib/unit-display";
import type { IngredientRow } from "@lib/inventory/types";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { fetchGrnDetail } from "@/(protected)/inventory/procurement-actions";
import type {
  GrnDetail,
  RecreateReceivingLocationOption,
} from "./grn-detail-model";

export type GrnDetailData = {
  grn: GrnDetail;
  ingredients: IngredientRow[];
  auditLogs: AuditLogRow[];
  canEditDraft: boolean;
  canConfirm: boolean;
  canAdjustStock: boolean;
  canAmendConfirmed: boolean;
  recreateLocationOptions: RecreateReceivingLocationOption[];
};

type InventoryLocationRow = {
  id: number;
  name: string;
  branch_id: number;
  location_kind: string | null;
  is_default_receive: boolean | null;
};

export type GrnDetailLoadResult =
  | { data: GrnDetailData; error?: never }
  | { data: null; error?: string; notFound?: boolean };

export async function loadGrnDetailResult(
  grnId: number | string,
  routeBranchId?: number,
): Promise<GrnDetailLoadResult> {
  const [result, ingredientsResult] = await Promise.all([
    fetchGrnDetail(grnId),
    fetchIngredients(),
  ]);
  if (!result.success || !result.data) {
    return {
      data: null,
      error: result.error,
      notFound: result.errorCode === "not_found",
    };
  }

  const context = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  const qcSettings: QcSettings = context
    ? await fetchQcSettings(context.supabase, context.claims.tenant_id)
    : {
        qty_short_tolerance_pct: 5,
        price_variance_warn_pct: 5,
        price_variance_review_pct: 15,
        reject_requires_photo: true,
      };

  const data = result.data as {
    grn: {
      id: number;
      grn_number: string;
      status: string;
      received_date: string | null;
      branch_id: number;
      location_id: number | null;
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
        ingredient_units?: {
          is_base: boolean;
          units: { code: string } | null;
        }[];
      } | null;
    }>;
    invoiceId: number | null;
  };

  if (routeBranchId != null && data.grn.branch_id !== routeBranchId) {
    notFound();
  }

  const supplier = data.grn.suppliers;
  const branch = data.grn.branches;
  const purchaseOrder = data.grn.purchase_orders;
  const ingredients = ingredientsResult.success
    ? ((ingredientsResult.data ?? []) as IngredientRow[])
    : [];
  const ingredientById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );

  const items: GrnDetail["items"] = (data.lines ?? []).map((line) => {
    const ingredient = line.ingredients;
    const qualityStatusMap: Record<string, string> = {
      accepted: "pass",
      rejected: "warning",
      partial: "warning",
    };
    const received = Number(line.received_quantity ?? 0);
    const rejected = Number(line.rejected_quantity ?? 0);
    const entryUnitId = line.entry_unit_id ?? null;
    const catalogIngredient = ingredientById.get(
      line.ingredient_id ?? ingredient?.id ?? 0,
    );
    const fallbackUnit =
      line.unit ||
      ingredient?.ingredient_units?.find((unit) => unit.is_base)?.units?.code ||
      "";

    return {
      lineId: line.id,
      ingredientId: line.ingredient_id,
      name: ingredient?.name ?? "—",
      sku: "",
      poQuantity: line.po_quantity != null ? Number(line.po_quantity) : null,
      poUnitPrice:
        line.po_unit_price != null ? Number(line.po_unit_price) : null,
      required: Number(line.po_quantity ?? line.received_quantity ?? 0),
      actual: received,
      accepted: received - rejected,
      rejected,
      rejectionReason: line.rejection_reason ?? "",
      rejectedPhotoUrl: line.rejected_photo_url ?? "",
      priceOverrideNote: line.price_override_note ?? "",
      priceOverridePhotoUrl: line.price_override_photo_url ?? "",
      priceVariancePct:
        line.price_variance_pct != null
          ? Number(line.price_variance_pct)
          : null,
      requiresReview: Boolean(line.requires_review),
      shortDeliveryAction:
        line.short_delivery_action === "accept_and_close" ||
        line.short_delivery_action === "wait_backorder"
          ? line.short_delivery_action
          : null,
      unit: getIngredientUnitDisplayName(
        catalogIngredient?.units,
        entryUnitId,
        fallbackUnit,
      ),
      entryUnitId,
      cost: Number(line.unit_cost ?? 0),
      temp:
        line.receiving_temperature != null
          ? `${line.receiving_temperature}°C`
          : null,
      qualityStatus:
        (line.quality_status as "accepted" | "rejected" | "partial") ??
        "accepted",
      status: qualityStatusMap[line.quality_status] ?? "pass",
    };
  });

  const grn: GrnDetail = {
    id: data.grn.id,
    tenantId: context?.claims.tenant_id ?? 0,
    code: data.grn.grn_number ?? "",
    poCode: purchaseOrder?.po_number ?? "",
    poId: purchaseOrder?.id,
    invoiceId: data.invoiceId ?? null,
    branchId: data.grn.branch_id,
    locationId: data.grn.location_id ?? null,
    branchName: branch?.name ?? `#${data.grn.branch_id}`,
    supplierId: data.grn.supplier_id,
    supplier: supplier?.name ?? "—",
    date: data.grn.received_date ? formatDate(data.grn.received_date) : "—",
    total: items.reduce((sum, item) => sum + item.cost * item.accepted, 0),
    tax: 0,
    status: data.grn.status ?? "draft",
    items,
    qcSettings: {
      qtyShortTolerancePct: qcSettings.qty_short_tolerance_pct,
      priceVarianceWarnPct: qcSettings.price_variance_warn_pct,
      priceVarianceReviewPct: qcSettings.price_variance_review_pct,
      rejectRequiresPhoto: qcSettings.reject_requires_photo,
    },
  };

  const [canAdjustStock, canEditDraft, canConfirm, canAmendConfirmed] =
    await Promise.all([
      currentUserHasPermission(
        data.grn.branch_id,
        PERMISSION_KEYS.INVENTORY_WRITE,
      ),
      currentUserHasPermission(
        data.grn.branch_id,
        PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
      ),
      currentUserHasPermission(
        data.grn.branch_id,
        PERMISSION_KEYS.PROCUREMENT_GRN_CONFIRM,
      ),
      currentUserHasPermission(
        data.grn.branch_id,
        PERMISSION_KEYS.PROCUREMENT_GRN_AMEND,
      ),
    ]);
  const recreateLocationOptions = await loadRecreateLocationOptions({
    context,
    status: data.grn.status,
    currentLocationId: data.grn.location_id,
    canAmendConfirmed,
  });
  const auditLogs = await fetchEntityAuditLogs(
    "goods_received_note",
    data.grn.id,
    50,
  );

  return {
    data: {
      grn,
      ingredients,
      auditLogs,
      canEditDraft,
      canConfirm,
      canAdjustStock,
      canAmendConfirmed,
      recreateLocationOptions,
    },
  };
}

async function loadRecreateLocationOptions({
  context,
  status,
  currentLocationId,
  canAmendConfirmed,
}: {
  context: Awaited<ReturnType<typeof getAuthContextWithPermission>>;
  status: string;
  currentLocationId: number | null;
  canAmendConfirmed: boolean;
}): Promise<RecreateReceivingLocationOption[]> {
  if (!context) return [];

  const permission =
    status === "draft"
      ? PERMISSION_KEYS.PROCUREMENT_GRN_CREATE
      : status === "confirmed" && canAmendConfirmed
        ? PERMISSION_KEYS.PROCUREMENT_GRN_AMEND
        : null;
  if (!permission) return [];

  const branches = await fetchProcurementBranches(
    context.supabase,
    context.claims.tenant_id,
  );
  const allowedBranches = [];
  for (const branch of branches) {
    const canUseTarget = await currentUserHasPermission(branch.id, permission);
    const canConfirmTarget =
      status === "confirmed"
        ? await currentUserHasPermission(
            branch.id,
            PERMISSION_KEYS.PROCUREMENT_GRN_CONFIRM,
          )
        : true;
    if (canUseTarget && canConfirmTarget) {
      allowedBranches.push(branch);
    }
  }

  const branchIds = allowedBranches.map((branch) => branch.id);
  if (branchIds.length === 0) return [];

  const { data: locations } = await context.supabase
    .from("inventory_locations")
    .select("id, name, branch_id, location_kind, is_default_receive")
    .eq("tenant_id", context.claims.tenant_id)
    .eq("is_active", true)
    .in("branch_id", branchIds)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  const branchById = new Map(
    allowedBranches.map((branch) => [branch.id, branch]),
  );

  return ((locations ?? []) as InventoryLocationRow[])
    .map((location) => {
      const branch = branchById.get(location.branch_id);
      return {
        id: location.id,
        name: location.name,
        branchId: location.branch_id,
        branchName: branch?.name ?? "Chi nhánh",
        branchKind: branch?.branch_kind ?? null,
        kind: location.location_kind,
        isDefaultReceive: location.is_default_receive === true,
      };
    })
    .filter(
      (location) => status !== "confirmed" || location.id !== currentLocationId,
    );
}

export async function loadGrnDetail(
  grnId: number | string,
  routeBranchId?: number,
): Promise<GrnDetailData | null> {
  const result = await loadGrnDetailResult(grnId, routeBranchId);
  return result.data;
}
