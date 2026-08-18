"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { JwtClaims } from "@comtammatu/shared/auth";
import {
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
  isBranchScopedProcurementRole,
  isProcurementBranchInScope,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";
import { fetchProcurementBranches } from "./_lib/procurement-branches";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { inventoryNonnegativeQuantitySchema } from "./_lib/inventory-quantity-schema";
import { mapInventoryRpcFailure } from "./_lib/rpc-failure";
import {
  attachIngredientBaseUnitEmbeds,
  loadIngredientBaseUnitEmbeds,
} from "@lib/inventory/load-ingredient-base-unit-embeds";
import {
  grnConfirmRpcMappings,
  grnLineRpcFallback,
  grnLineRpcMappings,
  INVENTORY_ERROR_CODES,
} from "@lib/messages/inventory-rpc-errors";

const ROLES = PROCUREMENT_ROLES;
const grnLoadFailedError = messages.inventory.grn.loadFailed;
const grnNotFoundError = messages.inventory.grn.notFound;

type GrnLookup =
  { kind: "id"; value: number } | { kind: "code"; value: string };

const grnLookupInputSchema = z.union([
  z.number().int().positive(),
  z.string().trim().min(1).max(64),
]);

function parseGrnLookup(input: number | string): GrnLookup | null {
  const parsed = grnLookupInputSchema.safeParse(input);
  if (!parsed.success) return null;
  if (typeof parsed.data === "number")
    return { kind: "id", value: parsed.data };

  const value = parsed.data;
  if (/^\d+$/.test(value)) {
    const numericId = Number(value);
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      return { kind: "id", value: numericId };
    }
  }
  if (/^GRN-[A-Za-z0-9_-]{1,60}$/.test(value)) {
    return { kind: "code", value };
  }
  return null;
}

/**
 * Cross-branch guard (D091). `branch_manager` is a
 * branch-scoped procurement role (its claims carry a non-null `branch_id`), so
 * `canAccessProcurementBranch` enforces strict `claims.branch_id === branchId`
 * — branch A cannot write a GRN for branch B.
 */
function canAccessProcurementBranch(
  claims: JwtClaims,
  branchId: number,
): boolean {
  if (!isBranchScopedProcurementRole(claims.user_role)) return true;
  return isProcurementBranchInScope(
    claims.user_role,
    claims.branch_id,
    branchId,
  );
}

/* ─── fetchGrnIdsForDropdown ─── */

type GrnDropdownLine = {
  id?: number | null;
  ingredient_id?: number | null;
  purchase_order_item_id?: number | null;
  po_applied_quantity?: number | null;
  entry_unit_id?: number | null;
  received_quantity?: number | null;
  rejected_quantity?: number | null;
  unit_cost?: number | null;
  total_cost?: number | null;
  supplier_id?: number | null;
  suppliers?: { id: number; name: string } | null;
  ingredients?: { id: number; name: string } | null;
  units?: { id: number; code: string; name: string | null } | null;
};

type GrnDropdownSourcePo = {
  id: number;
  supplier_id: number;
};

type GrnDropdownRow = {
  id: number;
  grn_number: string | null;
  supplier_id: number | null;
  po_id: number | null;
  suppliers: { id: number; name: string } | null;
  purchase_orders_source?: GrnDropdownSourcePo[] | null;
  grn_items?: GrnDropdownLine[] | null;
};

function sumGrnNetAcceptedAmount(lines: GrnDropdownLine[] | null | undefined) {
  if (!lines || lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    const booked = Number(line.total_cost);
    if (Number.isFinite(booked)) {
      total += booked;
      continue;
    }
    const received = Number(line.received_quantity ?? 0);
    const rejected = Number(line.rejected_quantity ?? 0);
    const unitCost = Number(line.unit_cost ?? 0);
    if (!Number.isFinite(received) || !Number.isFinite(rejected)) continue;
    if (!Number.isFinite(unitCost)) continue;
    total += (received - rejected) * unitCost;
  }
  return Math.round(total);
}

function expandGrnDropdownOptions(
  rows: GrnDropdownRow[],
  billedByLine: Map<string, number>,
  includeGrnId: number | undefined,
  withNetAmount: boolean,
) {
  const options: Array<{
    id: number;
    grn_number: string | null;
    supplier_id: number;
    po_id: number | null;
    suppliers: { id: number; name: string } | null;
    net_accepted_amount: number | null;
    lines: Array<{
      grn_item_id: number;
      purchase_order_item_id: number;
      ingredient_id: number;
      ingredient_name: string;
      entry_unit_id: number;
      unit_label: string;
      available_quantity: number;
    }>;
  }> = [];

  for (const row of rows) {
    const items = row.grn_items ?? [];
    const sourcePos = row.purchase_orders_source ?? [];
    const supplierIds: number[] = [];
    const supplierNameById = new Map<number, string>();

    if (row.supplier_id != null) {
      const headerSupplierId = Number(row.supplier_id);
      if (Number.isSafeInteger(headerSupplierId) && headerSupplierId > 0) {
        supplierIds.push(headerSupplierId);
        if (row.suppliers?.name) {
          supplierNameById.set(headerSupplierId, row.suppliers.name);
        }
      }
    } else {
      for (const line of items) {
        const lineSupplierId = Number(line.supplier_id);
        if (
          !Number.isSafeInteger(lineSupplierId) ||
          lineSupplierId <= 0 ||
          supplierIds.includes(lineSupplierId)
        ) {
          continue;
        }
        supplierIds.push(lineSupplierId);
        if (line.suppliers?.name) {
          supplierNameById.set(lineSupplierId, line.suppliers.name);
        }
      }
    }

    for (const supplierId of supplierIds) {
      const linesForSupplier = items.filter((line) => {
        const lineSupplierId = Number(line.supplier_id);
        if (Number.isSafeInteger(lineSupplierId) && lineSupplierId > 0) {
          return lineSupplierId === supplierId;
        }
        return (
          line.supplier_id == null && Number(row.supplier_id) === supplierId
        );
      });

      const sourcePo =
        sourcePos.find((po) => Number(po.supplier_id) === supplierId) ?? null;
      const legacyPoId =
        Number(row.supplier_id) === supplierId && row.po_id != null
          ? Number(row.po_id)
          : null;
      const poId = sourcePo?.id ?? legacyPoId;
      const supplierName = supplierNameById.get(supplierId) ?? null;
      const availableLines = linesForSupplier.flatMap((line) => {
        const grnItemId = Number(line.id);
        const poItemId = Number(line.purchase_order_item_id);
        const ingredientId = Number(line.ingredient_id);
        const unitId = Number(line.entry_unit_id);
        const accepted = Number(
          line.po_applied_quantity ??
            Number(line.received_quantity ?? 0) -
              Number(line.rejected_quantity ?? 0),
        );
        const billed = billedByLine.get(`${row.id}:${poItemId}`) ?? 0;
        const available = Math.max(accepted - billed, 0);
        if (
          !Number.isSafeInteger(grnItemId) ||
          grnItemId <= 0 ||
          !Number.isSafeInteger(poItemId) ||
          poItemId <= 0 ||
          !Number.isSafeInteger(ingredientId) ||
          ingredientId <= 0 ||
          !Number.isSafeInteger(unitId) ||
          unitId <= 0 ||
          available <= 0
        ) {
          return [];
        }
        return [
          {
            grn_item_id: grnItemId,
            purchase_order_item_id: poItemId,
            ingredient_id: ingredientId,
            ingredient_name: line.ingredients?.name ?? "Nguyên liệu",
            entry_unit_id: unitId,
            unit_label:
              line.units?.name ?? line.units?.code ?? "Đơn vị",
            available_quantity: available,
          },
        ];
      });
      if (
        availableLines.length === 0 &&
        (includeGrnId == null || includeGrnId !== row.id)
      ) {
        continue;
      }

      options.push({
        id: row.id,
        grn_number: row.grn_number,
        supplier_id: supplierId,
        po_id: poId != null && Number.isSafeInteger(poId) ? poId : null,
        suppliers:
          supplierName != null
            ? { id: supplierId, name: supplierName }
            : row.suppliers?.id === supplierId
              ? row.suppliers
              : null,
        net_accepted_amount: withNetAmount
          ? sumGrnNetAcceptedAmount(linesForSupplier)
          : null,
        lines: availableLines,
      });
    }
  }

  return options;
}

export async function fetchGrnIdsForDropdown(
  branchId?: number,
  includeGrnId?: number,
  excludeInvoiceId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const readClient = monetary.purchasePrice
    ? (monetary.client ?? supabase)
    : supabase;

  const selectWithNet =
    "id, grn_number, supplier_id, po_id, suppliers ( id, name ), purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey ( id, supplier_id )";
  const selectWithoutNet =
    "id, grn_number, supplier_id, po_id, suppliers ( id, name ), purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey ( id, supplier_id )";
  const itemSelectWithNet =
    "grn_id, id, ingredient_id, purchase_order_item_id, po_applied_quantity, entry_unit_id, received_quantity, rejected_quantity, unit_cost, total_cost, supplier_id, suppliers ( id, name ), ingredients ( id, name ), units!grn_items_entry_unit_id_fkey ( id, code, name )";
  const itemSelectWithoutNet =
    "grn_id, id, ingredient_id, purchase_order_item_id, po_applied_quantity, entry_unit_id, received_quantity, rejected_quantity, supplier_id, suppliers ( id, name ), ingredients ( id, name ), units!grn_items_entry_unit_id_fkey ( id, code, name )";

  let query = readClient
    .from("goods_received_notes")
    .select(monetary.purchasePrice ? selectWithNet : selectWithoutNet)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "confirmed")
    .order("received_date", { ascending: false })
    .limit(100);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) return { success: false, error: grnLoadFailedError };

  const headers = (data ?? []) as GrnDropdownRow[];
  const grnIds = headers.map((row) => row.id);
  if (
    includeGrnId != null &&
    Number.isSafeInteger(includeGrnId) &&
    includeGrnId > 0 &&
    !grnIds.includes(includeGrnId)
  ) {
    grnIds.push(includeGrnId);
  }

  const billedByLine = new Map<string, number>();
  if (grnIds.length > 0) {
    const { data: linkedRows, error: linkedError } = await supabase
      .from("supplier_invoice_receipt_allocations")
      .select(
        "supplier_invoice_id, grn_id, purchase_order_item_id, billed_quantity",
      )
      .eq("tenant_id", claims.tenant_id)
      .in("grn_id", grnIds)
      .not("purchase_order_item_id", "is", null);
    if (linkedError) return { success: false, error: grnLoadFailedError };
    for (const row of linkedRows ?? []) {
      if (Number(row.supplier_invoice_id) === excludeInvoiceId) continue;
      const grnId = Number(row.grn_id);
      const poItemId = Number(row.purchase_order_item_id);
      const quantity = Number(row.billed_quantity);
      if (
        !Number.isSafeInteger(grnId) ||
        grnId <= 0 ||
        !Number.isSafeInteger(poItemId) ||
        poItemId <= 0 ||
        !Number.isFinite(quantity)
      ) {
        continue;
      }
      const key = `${grnId}:${poItemId}`;
      billedByLine.set(key, (billedByLine.get(key) ?? 0) + quantity);
    }
  }
  const itemResult =
    grnIds.length === 0
      ? { data: [] as Array<GrnDropdownLine & { grn_id: number }>, error: null }
      : await readClient
          .from("grn_items")
          .select(monetary.purchasePrice ? itemSelectWithNet : itemSelectWithoutNet)
          .eq("tenant_id", claims.tenant_id)
          .in("grn_id", grnIds);
  if (itemResult.error) return { success: false, error: grnLoadFailedError };

  const itemsByGrnId = new Map<number, GrnDropdownLine[]>();
  for (const item of (itemResult.data ?? []) as Array<
    GrnDropdownLine & { grn_id: number }
  >) {
    const list = itemsByGrnId.get(item.grn_id) ?? [];
    list.push(item);
    itemsByGrnId.set(item.grn_id, list);
  }
  const rows = headers.map((row) => ({
    ...row,
    grn_items: itemsByGrnId.get(row.id) ?? [],
  }));

  return {
    success: true,
    data: expandGrnDropdownOptions(
      rows,
      billedByLine,
      includeGrnId,
      monetary.purchasePrice,
    ),
  };
}

/* ─── fetchGrnDetail ─── */

export async function fetchGrnDetail(
  grnKey: number | string,
): Promise<ActionResult> {
  const lookup = parseGrnLookup(grnKey);
  if (!lookup) return { success: false, error: "Mã phiếu nhập không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const lineReadClient = monetary.purchasePrice
    ? (monetary.client ?? supabase)
    : supabase;
  const grnQuery = supabase
    .from("goods_received_notes")
    .select(
      "id, tenant_id, branch_id, location_id, supplier_id, po_id, grn_number, status, received_date, expected_receive_date, notes, created_by, created_at, updated_at, branches ( id, name, branch_kind ), suppliers ( id, name ), purchase_orders!goods_received_notes_po_id_fkey ( id, po_number, display_id, status, purchase_request_id, purchase_requests!purchase_orders_purchase_request_tenant_fkey ( id, request_number ) )" as never,
    )
    .eq("tenant_id", claims.tenant_id);
  const { data: grnRaw, error: e1 } = await (
    lookup.kind === "id"
      ? grnQuery.eq("id", lookup.value)
      : grnQuery.eq("grn_number", lookup.value)
  ).maybeSingle();
  if (e1) {
    return {
      success: false,
      error: grnLoadFailedError,
      errorCode: "load_failed",
    };
  }
  if (!grnRaw) {
    return {
      success: false,
      error: grnNotFoundError,
      errorCode: "not_found",
    };
  }
  const grn = grnRaw as unknown as Record<string, unknown> & { id: number };
  const { data: linesRaw, error: e2 } = await lineReadClient
    .from("grn_items")
    .select(
      "id, grn_id, tenant_id, ingredient_id, supplier_id, purchase_order_item_id, po_applied_quantity, received_quantity, rejected_quantity, rejection_reason, rejected_photo_url, entry_unit_id, unit_cost, unit_cost_unit_id, total_cost, cost_pending, provisional_cost_source, suppliers ( id, name ), ingredients ( id, name ), purchase_order_items(quantity, entry_unit_id)" as never,
    )
    .eq("grn_id", grn.id)
    .eq("tenant_id", claims.tenant_id);
  if (e2)
    return {
      success: false,
      error: messages.inventory.grn.detailLoadFailed,
    };
  const lines = (linesRaw ?? []) as unknown as Array<{
    id: number;
    grn_id: number;
    tenant_id: number;
    ingredient_id: number;
    supplier_id: number;
    purchase_order_item_id: number | null;
    po_applied_quantity: number | string;
    received_quantity: number | string;
    rejected_quantity: number | string | null;
    rejection_reason: string | null;
    rejected_photo_url: string | null;
    entry_unit_id: number | null;
    unit_cost?: number | string;
    unit_cost_unit_id?: number | string | null;
    total_cost?: number | string;
    cost_pending?: boolean | null;
    provisional_cost_source?: string | null;
    suppliers: { id: number; name: string } | null;
    ingredients: {
      id: number;
      name: string;
      ingredient_units?: Array<{
        is_base: boolean;
        units: { code: string } | null;
      }>;
    } | null;
    purchase_order_items:
      | {
          quantity: number | string;
          entry_unit_id?: number | null;
        }
      | Array<{
          quantity: number | string;
          entry_unit_id?: number | null;
        }>
      | null;
  }>;
  const poItemIds = lines.flatMap((line) =>
    line.purchase_order_item_id == null ? [] : [line.purchase_order_item_id],
  );
  const [{ data: invoice }, { data: linkedPos }, previousResult, unitsByIngredient] =
    await Promise.all([
      supabase
        .from("supplier_invoices")
        .select("id")
        .eq("grn_id", grn.id)
        .eq("tenant_id", claims.tenant_id)
        .maybeSingle(),
      supabase
        .from("purchase_orders")
        .select("id, po_number, status, supplier_id, suppliers ( id, name )")
        .eq("tenant_id", claims.tenant_id)
        .eq("source_grn_id", grn.id)
        .order("id", { ascending: true }),
      poItemIds.length === 0
        ? Promise.resolve({ data: [] })
        : supabase
            .from("grn_items")
            .select(
              "purchase_order_item_id, po_applied_quantity, goods_received_notes!inner(id, status)" as never,
            )
            .eq("tenant_id", claims.tenant_id)
            .in("purchase_order_item_id" as never, poItemIds)
            .eq("goods_received_notes.status" as never, "confirmed"),
      loadIngredientBaseUnitEmbeds({
        supabase: lineReadClient,
        tenantId: claims.tenant_id,
        ingredientIds: lines.map((line) => line.ingredient_id),
      }),
    ]);
  attachIngredientBaseUnitEmbeds(lines, unitsByIngredient);
  const linkedPoRows = linkedPos ?? [];
  const previouslyApplied = new Map<number, number>();
  for (const row of (previousResult.data ?? []) as unknown as Array<{
    purchase_order_item_id: number | null;
    po_applied_quantity: number | string;
    goods_received_notes:
      { id: number; status: string } | Array<{ id: number; status: string }>;
  }>) {
    if (row.purchase_order_item_id == null) continue;
    const linkedGrn = Array.isArray(row.goods_received_notes)
      ? row.goods_received_notes[0]
      : row.goods_received_notes;
    if (linkedGrn?.id === grn.id) continue;
    previouslyApplied.set(
      row.purchase_order_item_id,
      (previouslyApplied.get(row.purchase_order_item_id) ?? 0) +
        Number(row.po_applied_quantity ?? 0),
    );
  }
  const projectedLines = lines.map((line) => {
    const poLine = Array.isArray(line.purchase_order_items)
      ? line.purchase_order_items[0]
      : line.purchase_order_items;
    return {
      ...line,
      po_quantity: poLine == null ? null : Number(poLine.quantity),
      po_entry_unit_id:
        poLine?.entry_unit_id == null ? null : Number(poLine.entry_unit_id),
      previously_applied_quantity:
        line.purchase_order_item_id == null
          ? 0
          : (previouslyApplied.get(line.purchase_order_item_id) ?? 0),
      cost_pending: line.cost_pending === true,
      provisional_cost_source: line.provisional_cost_source ?? null,
      unit_cost_unit_id:
        line.unit_cost_unit_id == null ? null : Number(line.unit_cost_unit_id),
      monetary: {
        unit_price:
          line.unit_cost == null ? null : Number(line.unit_cost),
        total_cost: Number(line.total_cost ?? 0),
      },
    };
  });
  return {
    success: true,
    data: {
      grn,
      lines: projectedLines,
      invoiceId: invoice?.id ?? null,
      linkedPos: linkedPoRows,
    },
  };
}

/* ─── discardGrnDraft (Sprint 6 #3) ─── */

const discardDraftSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
});

export const discardGrnDraft = withAction(
  {
    roles: ROLES,
    schema: discardDraftSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: draft, error: loadError } = await supabase
      .from("goods_received_notes")
      .select("id, branch_id, status")
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    if (loadError || !draft || draft.status !== "draft") {
      return {
        success: false,
        error: "Phiếu chờ nhập không tồn tại hoặc đã được xử lý.",
      };
    }
    if (!canAccessProcurementBranch(claims, draft.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được hủy phiếu nhập của nơi mình phụ trách.",
      };
    }

    const { data: raw, error } = await supabase.rpc(
      "cancel_goods_receipt_note" as never,
      {
        p_grn_id: data.grnId,
        p_reason: data.reason,
      } as never,
    );
    if (error) {
      return { success: false, error: "Không thể hủy phiếu nháp." };
    }
    const row = z
      .object({ id: z.coerce.number().int().positive() })
      .safeParse(raw);
    if (!row.success) {
      return {
        success: false,
        error: "Phiếu nháp không tồn tại hoặc đã được xử lý.",
      };
    }
    revalidatePath("/inventory/grn");
    return { success: true, data: { id: row.data.id } };
  },
);

const updateDraftGrnReceivingSiteSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  targetBranchId: z.coerce.number().int().positive(),
  targetLocationId: z.coerce.number().int().positive(),
});

export const updateDraftGrnReceivingSite = withAction(
  {
    roles: ROLES,
    schema: updateDraftGrnReceivingSiteSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: grn, error: grnError } = await supabase
      .from("goods_received_notes")
      .select("id, status, branch_id, location_id, po_id")
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (grnError || !grn) {
      return { success: false, error: "Không tìm thấy phiếu nhập." };
    }
    if (grn.status !== "draft") {
      return {
        success: false,
        error: "Chỉ đổi nơi nhập khi phiếu nhập đang ở trạng thái nháp.",
      };
    }
    if (!canAccessProcurementBranch(claims, grn.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa phiếu nhập của nơi mình phụ trách.",
      };
    }
    if (grn.po_id != null) {
      return {
        success: false,
        error: "Phiếu nháp đã gắn đơn mua nên không thể đổi kho nhận.",
      };
    }
    if (!canAccessProcurementBranch(claims, data.targetBranchId)) {
      return {
        success: false,
        error: "Bạn chưa có quyền tạo phiếu nhập cho nơi nhập mới.",
      };
    }

    const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
    if (!branches.some((branch) => branch.id === data.targetBranchId)) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }

    const { data: location, error: locationError } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("id", data.targetLocationId)
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", data.targetBranchId)
      .eq("is_active", true)
      .eq("location_kind", "warehouse")
      .maybeSingle();
    if (locationError || !location) {
      return { success: false, error: "Nơi nhập mới không hợp lệ." };
    }

    const { data: row, error } = await supabase
      .from("goods_received_notes")
      .update({
        branch_id: data.targetBranchId,
        location_id: data.targetLocationId,
      })
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "draft")
      .is("po_id", null)
      .select("id")
      .single();
    if (error || !row) {
      return { success: false, error: "Không thể đổi nơi nhập phiếu nháp." };
    }

    revalidatePath("/inventory/grn");
    revalidatePath(`/inventory/grn/${data.grnId}`);
    return { success: true, data: { id: row.id } };
  },
);

/* ─── upsertGrnLine ─── */

const GRN_NUMERIC_15_3_MAX = 999_999_999_999.999;
const grnQuantitySchema = inventoryNonnegativeQuantitySchema.refine(
  (value) => value <= GRN_NUMERIC_15_3_MAX,
  "Số lượng vượt giới hạn hệ thống.",
);

const grnLineSchema = z
  .object({
    grnId: z.coerce.number().int().positive(),
    lineId: z.coerce.number().int().positive().optional(),
    ingredientId: z.coerce.number().int().positive(),
    supplierId: z.coerce.number().int().positive(),
    // "Số đã giao" (gross delivered). Stock impact = receivedQuantity − rejectedQuantity.
    receivedQuantity: grnQuantitySchema,
    // Purchase-role unit the qty was entered in. NULL = already base.
    entryUnitId: z.coerce.number().int().positive().nullable().optional(),
    rejectedQuantity: grnQuantitySchema.optional(),
    rejectionReason: z.string().trim().max(500).optional().nullable(),
    rejectedPhotoUrl: z.string().trim().url().optional().nullable(),
    unitCost: z.coerce.number().min(0).max(99_999_999_999.99).optional(),
    unitCostUnitId: z.coerce.number().int().positive().nullable().optional(),
  })
  .superRefine((data, context) => {
    const rejected = data.rejectedQuantity ?? 0;
    if (rejected > data.receivedQuantity) {
      context.addIssue({
        code: "custom",
        message: "Số lượng từ chối không được vượt số đã giao.",
        path: ["rejectedQuantity"],
      });
    }
    if (rejected > 0 && !data.rejectionReason) {
      context.addIssue({
        code: "custom",
        message: "Phải nhập lý do khi có hàng từ chối nhập.",
        path: ["rejectionReason"],
      });
    }
    if (rejected > 0 && !data.rejectedPhotoUrl) {
      context.addIssue({
        code: "custom",
        message: "Phải có ảnh khi có hàng từ chối nhập.",
        path: ["rejectedPhotoUrl"],
      });
    }
    if ((data.unitCost ?? 0) > 0 && data.unitCostUnitId == null) {
      context.addIssue({
        code: "custom",
        message: "Đơn giá phải gắn đơn vị.",
        path: ["unitCostUnitId"],
      });
    }
  });

export const upsertGrnLine = withAction(
  {
    roles: ROLES,
    schema: grnLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: grn, error: grnError } = await supabase
      .from("goods_received_notes")
      .select("id, status, branch_id, supplier_id, po_id")
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (grnError || !grn) {
      return { success: false, error: "Không tìm thấy phiếu nhập." };
    }
    if (grn.status !== "draft") {
      return {
        success: false,
        error: "Chỉ chỉnh sửa dòng khi phiếu nhập đang ở trạng thái nháp.",
      };
    }
    if (!canAccessProcurementBranch(claims, grn.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa phiếu nhập của kho mình.",
      };
    }
    if (grn.supplier_id != null && data.supplierId !== grn.supplier_id) {
      return {
        success: false,
        error: "Nguyên liệu chưa được gán cho nhà cung cấp.",
      };
    }

    const { data: supplierItem, error: supplierItemError } = await supabase
      .from("supplier_items")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("supplier_id", data.supplierId)
      .eq("ingredient_id", data.ingredientId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (supplierItemError) {
      return {
        success: false,
        error: "Không thể kiểm tra nguyên liệu theo nhà cung cấp.",
      };
    }
    if (!supplierItem) {
      return {
        success: false,
        error: "Nguyên liệu chưa được gán cho nhà cung cấp.",
      };
    }

    const rejected = data.rejectedQuantity ?? 0;

    if (grn.po_id != null) {
      if (data.lineId == null) {
        return {
          success: false,
          error: "Dòng phiếu nhập phải giữ liên kết với đơn đặt hàng.",
        };
      }
      const { data: row, error } = await supabase
        .from("grn_items")
        .update({
          received_quantity: data.receivedQuantity,
          rejected_quantity: rejected,
          rejection_reason: data.rejectionReason ?? null,
          rejected_photo_url: data.rejectedPhotoUrl ?? null,
          ...(data.unitCost != null ? { unit_cost: data.unitCost } : {}),
          ...(data.unitCostUnitId != null
            ? { unit_cost_unit_id: data.unitCostUnitId }
            : {}),
          ...(data.entryUnitId != null
            ? { entry_unit_id: data.entryUnitId }
            : {}),
        } as never)
        .eq("id", data.lineId)
        .eq("grn_id", data.grnId)
        .eq("tenant_id", claims.tenant_id)
        .eq("ingredient_id", data.ingredientId)
        .select("id")
        .maybeSingle();
      if (error) {
        return mapInventoryRpcFailure(
          error,
          grnLineRpcMappings,
          grnLineRpcFallback,
        );
      }
      if (!row) {
        return {
          success: false,
          error: grnLineRpcFallback.userMessage,
          errorCode: INVENTORY_ERROR_CODES.GRN_LINE_FAILED,
          meta: {
            ingredientId: data.ingredientId,
            ...(data.lineId != null ? { lineId: data.lineId } : {}),
            field: "quantity",
          },
        };
      }
      return { success: true, data: row };
    }

    const resolvedUnit = await resolveEntryUnitCode(supabase, {
      tenantId: claims.tenant_id,
      ingredientId: data.ingredientId,
      entryUnitId: data.entryUnitId,
    });
    if (!resolvedUnit.success) {
      return { success: false, error: resolvedUnit.error };
    }

    const { data: row, error } = await supabase
      .from("grn_items")
      .upsert(
        {
          tenant_id: claims.tenant_id,
          grn_id: data.grnId,
          ingredient_id: data.ingredientId,
          supplier_id: data.supplierId,
          received_quantity: data.receivedQuantity,
          entry_unit_id: data.entryUnitId ?? null,
          rejected_quantity: rejected,
          rejection_reason: data.rejectionReason ?? null,
          rejected_photo_url: data.rejectedPhotoUrl ?? null,
          ...(data.unitCost != null ? { unit_cost: data.unitCost } : {}),
          ...(data.unitCostUnitId != null
            ? { unit_cost_unit_id: data.unitCostUnitId }
            : {}),
        } as never,
        { onConflict: "grn_id,ingredient_id,tenant_id" },
      )
      .select("id")
      .single();
    if (error) {
      return mapInventoryRpcFailure(
        error,
        grnLineRpcMappings,
        grnLineRpcFallback,
      );
    }
    if (!row) {
      return {
        success: false,
        error: grnLineRpcFallback.userMessage,
        errorCode: INVENTORY_ERROR_CODES.GRN_LINE_FAILED,
        meta: {
          ingredientId: data.ingredientId,
          field: "quantity",
        },
      };
    }
    return { success: true, data: row };
  },
);

/* ─── confirmGrn ─── */

const saveGoodsReceiptNoteSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  receivedDate: z.iso.datetime().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z
        .object({
          lineId: z.coerce.number().int().positive(),
          receivedQuantity: grnQuantitySchema,
          rejectedQuantity: grnQuantitySchema.default(0),
          rejectionReason: z.string().trim().max(500).nullable().optional(),
          rejectedPhotoUrl: z.string().trim().url().nullable().optional(),
          entryUnitId: z.coerce.number().int().positive().nullable().optional(),
          unitCost: z.coerce.number().min(0).max(99_999_999_999.99),
          unitCostUnitId: z.coerce
            .number()
            .int()
            .positive()
            .nullable()
            .optional(),
        })
        .refine(
          (line) => line.rejectedQuantity <= line.receivedQuantity,
          "Số lượng từ chối không được vượt số đã giao.",
        )
        .refine(
          (line) =>
            line.rejectedQuantity === 0 ||
            Boolean(line.rejectionReason && line.rejectedPhotoUrl),
          "Hàng từ chối phải có đủ lý do và ảnh.",
        )
        .refine(
          (line) => !(line.unitCost > 0) || line.unitCostUnitId != null,
          "Đơn giá phải gắn đơn vị.",
        ),
    )
    .min(1)
    .max(200),
});

export const saveGoodsReceiptNote = withAction(
  {
    roles: ROLES,
    schema: saveGoodsReceiptNoteSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc(
      "save_goods_receipt_note" as never,
      {
        p_grn_id: data.grnId,
        p_received_date: data.receivedDate ?? null,
        p_notes: data.notes ?? null,
        p_lines: data.lines.map((line) => ({
          line_id: line.lineId,
          received_quantity: line.receivedQuantity,
          rejected_quantity: line.rejectedQuantity,
          rejection_reason: line.rejectionReason ?? null,
          rejected_photo_url: line.rejectedPhotoUrl ?? null,
          entry_unit_id: line.entryUnitId ?? null,
          unit_cost: line.unitCost,
          unit_cost_unit_id: line.unitCostUnitId ?? null,
        })),
      } as never,
    );
    if (error) {
      console.error("inventory.grn.save_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return mapInventoryRpcFailure(
        error,
        grnLineRpcMappings,
        {
          userMessage: "Không thể lưu phiếu nhập.",
          errorCode: INVENTORY_ERROR_CODES.GRN_LINE_FAILED,
        },
      );
    }
    revalidatePath("/inventory/grn");
    revalidatePath(`/inventory/grn/${data.grnId}`);
    return { success: true };
  },
);

const deleteGrnLineSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
});

export const deleteGrnLine = withAction(
  {
    roles: ROLES,
    schema: deleteGrnLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: grn, error: grnError } = await supabase
      .from("goods_received_notes")
      .select("id, status, branch_id, po_id")
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (grnError || !grn) {
      return { success: false, error: "Không tìm thấy phiếu nhập." };
    }
    if (grn.status !== "draft") {
      return {
        success: false,
        error: "Chỉ xóa dòng khi phiếu nhập đang ở trạng thái nháp.",
      };
    }
    if (grn.po_id != null) {
      return {
        success: false,
        error: "Phiếu nhập đã gắn đơn mua nên không thể xóa dòng.",
      };
    }
    if (!canAccessProcurementBranch(claims, grn.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa phiếu nhập của kho mình.",
      };
    }

    const { error } = await supabase
      .from("grn_items")
      .delete()
      .eq("id", data.lineId)
      .eq("grn_id", data.grnId)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể xóa dòng." };
    }
    return { success: true };
  },
);

export async function confirmGrn(grnId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(grnId);
  if (!id.success)
    return { success: false, error: "Mã phiếu nhập không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_GRN_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("confirm_goods_receipt_note", {
    p_grn_id: id.data,
  });
  if (error) {
    console.error("inventory.grn.confirm_failed", {
      error: error,
    });
    return mapInventoryRpcFailure(
      error,
      grnConfirmRpcMappings,
      {
        userMessage: messages.inventory.grn.confirmFailed,
        errorCode: INVENTORY_ERROR_CODES.GRN_CONFIRM_FAILED,
      },
    );
  }

  revalidatePath("/inventory/grn");

  return { success: true, data };
}

/* ─── amendGrnLine (Owner force-edit on confirmed GRN) ─── */

const amendGrnLineSchema = z
  .object({
    grnId: z.coerce.number().int().positive(),
    lineId: z.coerce.number().int().positive(),
    receivedQuantity: grnQuantitySchema,
    rejectedQuantity: grnQuantitySchema.optional().nullable(),
    rejectionReason: z
      .string()
      .trim()
      .max(500, { error: "Lý do tối đa 500 ký tự" })
      .optional()
      .nullable(),
    rejectedPhotoUrl: z.string().trim().url().optional().nullable(),
    reason: z
      .string()
      .trim()
      .min(5, { error: "Lý do sửa tối thiểu 5 ký tự." })
      .max(500, { error: "Lý do sửa tối đa 500 ký tự." }),
  })
  .refine(
    (d) =>
      d.rejectedQuantity == null || d.rejectedQuantity <= d.receivedQuantity,
    {
      error: "Số lượng từ chối không được vượt số đã giao.",
      path: ["rejectedQuantity"],
    },
  )
  .superRefine((data, context) => {
    if ((data.rejectedQuantity ?? 0) > 0 && !data.rejectionReason) {
      context.addIssue({
        code: "custom",
        message: "Phải nhập lý do khi có hàng từ chối nhập.",
        path: ["rejectionReason"],
      });
    }
    if ((data.rejectedQuantity ?? 0) > 0 && !data.rejectedPhotoUrl) {
      context.addIssue({
        code: "custom",
        message: "Phải có ảnh khi có hàng từ chối nhập.",
        path: ["rejectedPhotoUrl"],
      });
    }
  });

export const amendGrnLine = withAction(
  {
    roles: ROLES,
    schema: amendGrnLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_AMEND,
  },
  async (data, { supabase }) => {
    const { data: row, error } = await supabase.rpc(
      "amend_grn_line" as never,
      {
        p_grn_id: data.grnId,
        p_line_id: data.lineId,
        p_received_quantity: data.receivedQuantity,
        p_rejected_quantity: data.rejectedQuantity ?? undefined,
        p_rejection_reason: data.rejectionReason ?? undefined,
        p_rejected_photo_url: data.rejectedPhotoUrl ?? undefined,
        p_reason: data.reason,
      } as never,
    );

    if (error) {
      console.error("inventory.grn.amend_line_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Map known PG error codes to friendly messages.
      const msg = error.message || "";
      if (msg.includes("forbidden_owner_only")) {
        return {
          success: false,
          error: "Chỉ chủ sở hữu được sửa phiếu đã chốt.",
        };
      }
      if (msg.includes("grn_not_confirmed_use_upsert")) {
        return {
          success: false,
          error: "Chỉ áp dụng cho phiếu nhập đã chốt.",
        };
      }
      if (msg.includes("has_paid_invoice")) {
        return {
          success: false,
          error:
            "Phiếu đã có hóa đơn NCC đang/đã thanh toán — không thể sửa trực tiếp.",
        };
      }
      if (msg.includes("negative_stock")) {
        return {
          success: false,
          error: "Sửa làm tồn kho âm — không cho phép.",
        };
      }
      if (msg.includes("grn_receive_location_invalid")) {
        return {
          success: false,
          error:
            "Nơi nhập của phiếu không còn hợp lệ. Kiểm tra lại cấu hình kho.",
        };
      }
      if (msg.includes("grn_receive_location_missing")) {
        return {
          success: false,
          error: "Phiếu chưa có nơi nhập hợp lệ để điều chỉnh tồn kho.",
        };
      }
      if (error.code === "22003" || msg.includes("numeric field overflow")) {
        return {
          success: false,
          error: "Số lượng vượt giới hạn hệ thống. Kiểm tra lại đơn vị.",
        };
      }
      if (msg.includes("rejected_exceeds_received")) {
        return {
          success: false,
          error: "Số lượng từ chối không được vượt số đã giao.",
        };
      }
      if (msg.includes("grn_qc_reason_required")) {
        return { success: false, error: "Phải nhập lý do cho hàng từ chối." };
      }
      if (msg.includes("grn_qc_photo_required")) {
        return { success: false, error: "Phải có ảnh cho hàng từ chối." };
      }
      if (msg.includes("grn_rejection_evidence_required")) {
        return {
          success: false,
          error: "Hàng từ chối phải có đủ lý do và ảnh.",
        };
      }
      if (msg.includes("invalid_quantity")) {
        return { success: false, error: "Số lượng không hợp lệ." };
      }
      if (msg.includes("grn_line_not_found")) {
        return { success: false, error: "Không tìm thấy dòng phiếu nhập." };
      }
      return { success: false, error: "Không thể sửa dòng phiếu nhập." };
    }

    revalidatePath("/inventory/grn");
    revalidatePath(`/inventory/grn/${data.grnId}`);
    return { success: true, data: row };
  },
);
