import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { fetchEntityAuditLogs, type AuditLogRow } from "@/_lib/audit";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { formatDate } from "@lib/inventory/format";
import { fetchProcurementBranches } from "@/(protected)/inventory/_lib/procurement-branches";
import { getIngredientUnitDisplayName } from "@/(protected)/inventory/_lib/unit-display";
import type { IngredientRow } from "@lib/inventory/types";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { fetchGrnDetail } from "@/(protected)/inventory/procurement-actions";
import { messages } from "@lib/messages";
import {
  allLinkedPosApproved,
  grnSupplierSummaryFromItems,
  hasLinkedPurchaseOrders,
  type GrnDetail,
  type GrnLinkedPo,
  type ReceivingLocationOption,
} from "./grn-detail-model";

export type GrnDetailData = {
  grn: GrnDetail;
  ingredients: IngredientRow[];
  auditLogs: AuditLogRow[];
  canEditDraft: boolean;
  canConfirm: boolean;
  canCreatePoFromGrn: boolean;
  canManageSupplierInvoice: boolean;
  canAdjustStock: boolean;
  canAmendConfirmed: boolean;
  receivingLocationOptions: ReceivingLocationOption[];
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

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
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
      branch_id: number;
      location_id: number | null;
      supplier_id: number | null;
      po_id: number | null;
      branches: { id: number; name: string } | null;
      suppliers: { id: number; name: string } | null;
      purchase_orders: { id: number; po_number: string; status: string } | null;
    };
    lines: Array<{
      id: number;
      ingredient_id: number;
      supplier_id: number;
      po_quantity: number | null;
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
  const ingredients = (ingredientsResult.data ?? []) as IngredientRow[];
  const ingredientById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const items: GrnDetail["items"] = (data.lines ?? []).map((line) => {
    const ingredient = line.ingredients;
    const received = Number(line.received_quantity ?? 0);
    const rejected = Number(line.rejected_quantity ?? 0);
    const entryUnitId = line.entry_unit_id ?? null;
    const catalogIngredient = ingredientById.get(
      line.ingredient_id ?? ingredient?.id ?? 0,
    );
    const fallbackUnit =
      ingredient?.ingredient_units?.find((unit) => unit.is_base)?.units?.code ||
      "";
    const lineSupplier = relatedOne(line.suppliers);

    return {
      lineId: line.id,
      ingredientId: line.ingredient_id,
      name: ingredient?.name ?? "—",
      sku: "",
      supplierId: line.supplier_id,
      supplierName: lineSupplier?.name ?? `#${line.supplier_id}`,
      poQuantity: line.po_quantity != null ? Number(line.po_quantity) : null,
      required: Number(line.po_quantity ?? line.received_quantity ?? 0),
      actual: received,
      rejected,
      rejectionReason: line.rejection_reason ?? "",
      rejectedPhotoUrl: line.rejected_photo_url ?? "",
      unit: getIngredientUnitDisplayName(
        catalogIngredient?.units,
        entryUnitId,
        fallbackUnit,
      ),
      entryUnitId,
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
    canCreatePoFromGrn,
    canManageSupplierInvoice,
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
      PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
    ),
    currentUserHasPermission(
      data.grn.branch_id,
      PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
    ),
  ]);

  const hasPoLink = hasLinkedPurchaseOrders(linkedPos, data.grn.po_id);
  const canEditUnlinkedDraft =
    canEditDraft && data.grn.status === "draft" && !hasPoLink;
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
  const canCreatePoFromGrnDraft =
    canCreatePoFromGrn && data.grn.status === "draft" && !hasPoLink;
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
      canEditDraft: canEditUnlinkedDraft,
      canConfirm,
      canCreatePoFromGrn: canCreatePoFromGrnDraft,
      canManageSupplierInvoice,
      canAdjustStock,
      canAmendConfirmed,
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
