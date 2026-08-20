import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { formatDate } from "@lib/inventory/format";
import { fetchProcurementBranches } from "@/(protected)/inventory/_lib/procurement-branches";
import { getIngredientUnitDisplayName } from "@/(protected)/inventory/_lib/unit-display";
import type { IngredientRow, IngredientUnitRow } from "@lib/inventory/types";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { fetchGrnDetail } from "@/(protected)/inventory/procurement-actions";
import { messages } from "@lib/messages";
import { loadUnpricedConfirmedGrnQueue } from "./grn-list-data";
import { canShowGrnInvoiceChrome } from "./grn-list-model";
import {
  allLinkedPosApproved,
  calculateGrnQuantities,
  convertQuantityBetweenFactors,
  grnSupplierSummaryFromItems,
  hasLinkedPurchaseOrders,
  resolveDefaultGrnPriceUnit,
  resolveGrnPackLooseUnits,
  type GrnDetail,
  type GrnDetailData,
  type GrnLinkedPo,
  type ReceivingLocationOption,
} from "./grn-detail-model";

export type { GrnDetailData };

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

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function unitToBaseFactor(
  units: IngredientUnitRow[] | undefined,
  unitId: number | null | undefined,
): number {
  if (unitId == null) return 1;
  const row = (units ?? []).find(
    (unit) => unit.unit_id === unitId && unit.is_active,
  );
  const factor = Number(row?.to_base_factor);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

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
  if (!ingredientsResult.success) {
    return {
      data: null,
      error:
        ingredientsResult.error ??
        messages.inventory.ingredients.list.loadFailed,
    };
  }

  const context = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  const data = result.data as {
    grn: {
      id: number;
      grn_number: string;
      status: string;
      received_date: string | null;
      expected_receive_date: string | null;
      branch_id: number;
      location_id: number | null;
      supplier_id: number | null;
      po_id: number | null;
      branches: { id: number; name: string } | null;
      suppliers: { id: number; name: string } | null;
      purchase_orders: {
        id: number;
        po_number: string;
        status: string;
        purchase_request_id: number | null;
        purchase_requests:
          | { id: number; request_number: string }
          | Array<{ id: number; request_number: string }>
          | null;
      } | null;
    };
    lines: Array<{
      id: number;
      ingredient_id: number;
      supplier_id: number;
      po_quantity: number | null;
      po_entry_unit_id?: number | null;
      previously_applied_quantity: number;
      po_applied_quantity: number;
      confirmed_at?: string | null;
      received_quantity: number;
      rejected_quantity: number | null;
      rejection_reason: string | null;
      rejected_photo_url: string | null;
      entry_unit_id: number | null;
      suppliers: { id: number; name: string } | null;
      ingredients: {
        id: number;
        name: string;
        ingredient_units?: {
          is_base: boolean;
          units: { code: string } | null;
        }[];
      } | null;
      cost_pending?: boolean | null;
      provisional_cost_source?: string | null;
      unit_cost_unit_id?: number | null;
      monetary: {
        unit_price: number | null;
        total_cost: number;
      } | null;
    }>;
    invoiceId: number | null;
    linkedPos: Array<{
      id: number;
      po_number: string;
      status: string;
      supplier_id: number | null;
      suppliers: { id: number; name: string } | null;
    }>;
  };

  if (routeBranchId != null && data.grn.branch_id !== routeBranchId) {
    notFound();
  }

  const supplier = data.grn.suppliers;
  const branch = data.grn.branches;
  const purchaseOrder = data.grn.purchase_orders;
  const purchaseRequest = relatedOne(purchaseOrder?.purchase_requests);
  const ingredients = (ingredientsResult.data ?? []) as IngredientRow[];
  const ingredientById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const items: GrnDetail["items"] = (data.lines ?? []).map((line) => {
    const ingredient = line.ingredients;
    const storedReceived = Number(line.received_quantity ?? 0);
    const storedRejected = Number(line.rejected_quantity ?? 0);
    const ordered = Number(line.po_quantity ?? 0);
    const previouslyReceived = Number(line.previously_applied_quantity ?? 0);
    const remaining = Math.max(ordered - previouslyReceived, 0);
    const catalogIngredient = ingredientById.get(
      line.ingredient_id ?? ingredient?.id ?? 0,
    );
    const storedEntryUnitId = line.entry_unit_id ?? null;
    const poEntryUnitId = line.po_entry_unit_id ?? storedEntryUnitId;
    const packLoose = resolveGrnPackLooseUnits(
      catalogIngredient?.units,
      poEntryUnitId,
    );
    const persistUnit = packLoose?.loose ?? null;
    const storedFactor = unitToBaseFactor(
      catalogIngredient?.units,
      storedEntryUnitId,
    );
    const persistFactor =
      persistUnit?.toBaseFactor ??
      unitToBaseFactor(catalogIngredient?.units, storedEntryUnitId);
    const poFactor = unitToBaseFactor(catalogIngredient?.units, poEntryUnitId);
    const persistUnitId = persistUnit?.unitId ?? storedEntryUnitId;
    const received =
      persistUnit != null && persistUnit.unitId !== storedEntryUnitId
        ? convertQuantityBetweenFactors(
            storedReceived,
            storedFactor,
            persistFactor,
          )
        : storedReceived;
    const rejected =
      persistUnit != null && persistUnit.unitId !== storedEntryUnitId
        ? convertQuantityBetweenFactors(
            storedRejected,
            storedFactor,
            persistFactor,
          )
        : storedRejected;
    const calculated = calculateGrnQuantities(received, rejected, remaining, {
      persistToBase: persistFactor,
      poToBase: poFactor,
    });
    const applied =
      data.grn.status === "confirmed" || line.confirmed_at != null
        ? Number(line.po_applied_quantity ?? 0)
        : calculated.poAppliedQuantity;
    const fallbackUnit =
      ingredient?.ingredient_units?.find((unit) => unit.is_base)?.units?.code ||
      "";
    const lineSupplier = relatedOne(line.suppliers);
    const persistUnitLabel = persistUnit
      ? persistUnit.label
      : getIngredientUnitDisplayName(
          catalogIngredient?.units,
          persistUnitId,
          fallbackUnit,
        );
    const poUnitLabel = getIngredientUnitDisplayName(
      catalogIngredient?.units,
      poEntryUnitId,
      persistUnitLabel,
    );
    const defaultPrice = resolveDefaultGrnPriceUnit({
      packUnit: packLoose?.pack ?? null,
      looseUnit: packLoose?.loose ?? null,
      entryUnitId: persistUnitId,
      persistToBaseFactor: persistFactor,
      unit: persistUnitLabel,
    });
    const storedPriceUnitId =
      line.unit_cost_unit_id == null ? null : Number(line.unit_cost_unit_id);
    const priceUnitId = storedPriceUnitId ?? defaultPrice.unitId;
    const unitCostToBaseFactor = unitToBaseFactor(
      catalogIngredient?.units,
      priceUnitId,
    );
    const unitCostUnitLabel = getIngredientUnitDisplayName(
      catalogIngredient?.units,
      priceUnitId,
      defaultPrice.label,
    );

    return {
      lineId: line.id,
      ingredientId: line.ingredient_id,
      name: ingredient?.name ?? "—",
      sku: "",
      supplierId: line.supplier_id,
      supplierName: lineSupplier?.name ?? `#${line.supplier_id}`,
      poQuantity: line.po_quantity != null ? Number(line.po_quantity) : null,
      previouslyReceived,
      remainingQuantity: remaining,
      required: remaining,
      actual: received,
      rejected,
      acceptedQuantity: calculated.acceptedQuantity,
      poAppliedQuantity: applied,
      shortageQuantity: calculated.shortageQuantity,
      excessQuantity: calculated.excessQuantity,
      rejectionReason: line.rejection_reason ?? "",
      rejectedPhotoUrl: line.rejected_photo_url ?? "",
      unit: persistUnitLabel,
      entryUnitId: persistUnitId,
      poEntryUnitId,
      poUnitLabel,
      persistToBaseFactor: persistFactor,
      poToBaseFactor: poFactor,
      packUnit: packLoose?.pack ?? null,
      looseUnit: packLoose?.loose ?? null,
      unitCostUnitId: priceUnitId,
      unitCostUnitLabel,
      unitCostToBaseFactor:
        unitCostToBaseFactor > 0 ? unitCostToBaseFactor : defaultPrice.toBaseFactor,
      costPending: line.cost_pending === true,
      provisionalCostSource: line.provisional_cost_source ?? null,
      suggestedUnitCost: null,
      suggestedUnitCostUnitId: null,
      suggestedUnitName: null,
      suggestedSourceGrnId: null,
      suggestedSourceGrnNumber: null,
      confirmedAt: line.confirmed_at ?? null,
      monetary:
        line.monetary == null
          ? null
          : {
              unitPrice: line.monetary.unit_price,
              lineTotal: line.monetary.total_cost,
            },
    };
  });

  const linkedPos: GrnLinkedPo[] = (data.linkedPos ?? []).map((po) => {
    const poSupplier = relatedOne(po.suppliers);
    return {
      id: po.id,
      poNumber: po.po_number,
      status: po.status,
      supplierId: po.supplier_id,
      supplierName: poSupplier?.name ?? (po.supplier_id != null ? `#${po.supplier_id}` : "—"),
    };
  });

  const [
    currentLocationName,
    canAdjustStock,
    canEditDraft,
    canConfirmPermission,
    canAmendConfirmed,
    invoiceCreate,
    unpricedQueue,
  ] = await Promise.all([
    loadCurrentReceivingLocationName({
      context,
      branchId: data.grn.branch_id,
      locationId: data.grn.location_id,
    }),
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
    currentUserHasPermission(
      data.grn.branch_id,
      PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
    ),
    context != null &&
      context.claims.user_role === "owner" &&
      data.grn.status === "confirmed"
      ? loadUnpricedConfirmedGrnQueue(context.supabase)
      : Promise.resolve({ rows: [], total: 0 }),
  ]);

  const canManageSupplierInvoice =
    invoiceCreate && canShowGrnInvoiceChrome(context?.claims.user_role);

  const canPatchConfirmedUnitCost =
    context?.claims.user_role === "owner" && data.grn.status === "confirmed";
  if (canPatchConfirmedUnitCost) {
    const suggestionByLineId = new Map(
      (unpricedQueue?.rows ?? []).map((row) => [row.grnItemId, row]),
    );
    for (const item of items) {
      const suggestion = suggestionByLineId.get(item.lineId);
      if (!suggestion) continue;
      item.suggestedUnitCost = suggestion.suggestedUnitCost;
      item.suggestedUnitCostUnitId = suggestion.suggestedUnitCostUnitId;
      item.suggestedUnitName = suggestion.suggestedUnitName;
      item.suggestedSourceGrnId = suggestion.suggestedSourceGrnId;
      item.suggestedSourceGrnNumber = suggestion.suggestedSourceGrnNumber;
    }
  }

  const hasPoLink = hasLinkedPurchaseOrders(linkedPos, data.grn.po_id);
  const canEditDraftLines = canEditDraft && data.grn.status === "draft";
  const canEditUnlinkedDraft = canEditDraftLines && !hasPoLink;
  const supplierSummary = grnSupplierSummaryFromItems(
    items,
    supplier?.name ?? null,
  );
  const grn: GrnDetail = {
    id: data.grn.id,
    tenantId: context?.claims.tenant_id ?? 0,
    code: data.grn.grn_number ?? "",
    poCode:
      linkedPos.length === 1
        ? linkedPos[0]!.poNumber
        : linkedPos.length > 1
          ? `${linkedPos[0]!.poNumber} +${linkedPos.length - 1}`
          : (purchaseOrder?.po_number ?? ""),
    poId: data.grn.po_id ?? linkedPos[0]?.id ?? null,
    poStatus: linkedPos[0]?.status ?? purchaseOrder?.status ?? null,
    purchaseRequestId: purchaseOrder?.purchase_request_id ?? null,
    purchaseRequestCode: purchaseRequest?.request_number ?? null,
    expectedReceiveDate: data.grn.expected_receive_date
      ? formatDate(data.grn.expected_receive_date)
      : null,
    linkedPos,
    invoiceId: data.invoiceId ?? null,
    branchId: data.grn.branch_id,
    locationId: data.grn.location_id ?? null,
    locationName: currentLocationName,
    branchName: branch?.name ?? `#${data.grn.branch_id}`,
    supplierId: data.grn.supplier_id,
    supplier: supplierSummary,
    date: data.grn.received_date ? formatDate(data.grn.received_date) : "—",
    status: data.grn.status ?? "draft",
    items,
  };
  const poApproved = allLinkedPosApproved(
    linkedPos,
    purchaseOrder?.status ?? null,
  );
  const canConfirm =
    canConfirmPermission &&
    data.grn.status === "draft" &&
    hasPoLink &&
    poApproved;
  const [receivingLocationOptions, auditLogs] = await Promise.all([
    loadReceivingLocationOptions({
      context,
      canEditDraft: canEditUnlinkedDraft,
    }),
    fetchEntityAuditLogs("goods_received_note", data.grn.id, 50),
  ]);

  return {
    data: {
      grn,
      ingredients,
      auditLogs,
      canEditDraft: canEditDraftLines,
      canConfirm,
      canManageSupplierInvoice,
      canAdjustStock,
      canAmendConfirmed,
      canPatchConfirmedUnitCost,
      receivingLocationOptions,
    },
  };
}

async function loadReceivingLocationOptions({
  context,
  canEditDraft,
}: {
  context: Awaited<ReturnType<typeof getAuthContextWithPermission>>;
  canEditDraft: boolean;
}): Promise<ReceivingLocationOption[]> {
  if (!context || !canEditDraft) return [];

  const branches = await fetchProcurementBranches(
    context.supabase,
    context.claims.tenant_id,
  );
  const allowedBranches = [];
  for (const branch of branches) {
    const canUseTarget = await currentUserHasPermission(
      branch.id,
      PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
    );
    if (canUseTarget) {
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
    .eq("location_kind", "warehouse")
    .in("branch_id", branchIds)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  const branchById = new Map(
    allowedBranches.map((branch) => [branch.id, branch]),
  );

  return ((locations ?? []) as InventoryLocationRow[]).map((location) => {
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
  });
}

async function loadCurrentReceivingLocationName({
  context,
  branchId,
  locationId,
}: {
  context: Awaited<ReturnType<typeof getAuthContextWithPermission>>;
  branchId: number;
  locationId: number | null;
}): Promise<string | null> {
  if (!context || locationId == null) return null;

  const { data } = await context.supabase
    .from("inventory_locations")
    .select("name")
    .eq("tenant_id", context.claims.tenant_id)
    .eq("branch_id", branchId)
    .eq("id", locationId)
    .maybeSingle();

  return data?.name?.trim() || null;
}

export async function loadGrnDetail(
  grnId: number | string,
  routeBranchId?: number,
): Promise<GrnDetailData | null> {
  const result = await loadGrnDetailResult(grnId, routeBranchId);
  return result.data;
}
