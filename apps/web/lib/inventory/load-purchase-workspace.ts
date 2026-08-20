import "server-only";

import { purchaseDemandLineProgress } from "@lib/inventory/purchase-demand-progress";
import type {
  PurchaseOrderRow,
  PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import type { TenantSupabase } from "@lib/inventory/types";
import { messages } from "@lib/messages";

export const PURCHASE_WORKSPACE_LIST_LIMIT = 200;

/** Large `.in(id)` lists on child tables hit statement timeout on Production. */
export const PURCHASE_WORKSPACE_IN_CHUNK_SIZE = 40;

// Nested PostgREST embeds re-evaluate RLS EXISTS + has_permission per parent
// row and timed out (SQLSTATE 57014) on /inventory/purchase-orders. Keep
// parent selects flat and load children with chunked `.in(id)`.

/** Parent rows only. Child rows load in a follow-up `.in(id)` query. */
export const DEMAND_LIST_SELECT =
  "id, request_number, branch_id, status, status_reason, needed_by, notes, created_at, updated_at";

export const DEMAND_ITEM_SELECT =
  "id, purchase_request_id, ingredient_id, quantity, entry_unit_id, notes, ingredients(name), units!purchase_request_items_entry_unit_id_fkey(code, name)";

export const ORDER_LIST_SELECT =
  "id, po_number, display_id, status, ordered_at, expected_delivery_date, notes, status_reason, supplier_id, branch_id, purchase_group_key, purchase_group_code, group_sequence";

export const ORDER_ITEM_SELECT =
  "id, po_id, ingredient_id, quantity, entry_unit_id, supplier_id, ingredients(name), units!purchase_order_items_entry_unit_id_fkey(code, name)";

export const DEMAND_COVERAGE_SELECT =
  "id, po_number, display_id, status, supplier_id, purchase_request_id";

export const DEMAND_COVERAGE_ITEM_SELECT =
  "po_id, purchase_request_item_id, quantity, entry_to_base_factor";

export const GRN_BY_PO_SELECT =
  "id, po_id, grn_number, status, received_date";

type NamedEmbed = { name: string } | { name: string }[] | null;
type UnitEmbed =
  | { code: string; name: string | null }
  | { code: string; name: string | null }[]
  | null;

type DemandRecord = {
  id: number;
  request_number: string;
  branch_id: number;
  status: string;
  status_reason: string | null;
  needed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  purchase_request_items: Array<{
    id: number;
    ingredient_id: number;
    quantity: number | string;
    entry_unit_id: number;
    notes: string | null;
    ingredients: NamedEmbed;
    units: UnitEmbed;
  }>;
};

type DemandItemRecord = DemandRecord["purchase_request_items"][number] & {
  purchase_request_id: number;
};

type CoverageOrderRecord = {
  id: number;
  po_number: string;
  display_id: string | null;
  status: string;
  supplier_id: number | null;
  purchase_request_id: number | null;
  purchase_order_items: Array<{
    purchase_request_item_id: number | null;
    quantity: number | string;
    entry_to_base_factor: number | string | null;
  }>;
};

type AllocationRecord = {
  purchase_request_id: number;
  purchase_request_item_id: number;
  supplier_id: number;
  quantity: number | string;
};

type UnitFactorRecord = {
  ingredient_id: number;
  unit_id: number;
  to_base_factor: number | string;
};

type PurchaseOrderRecord = {
  id: number;
  po_number: string;
  display_id: string | null;
  status: string;
  ordered_at: string;
  expected_delivery_date: string | null;
  notes: string | null;
  status_reason: string | null;
  supplier_id: number | null;
  branch_id: number;
  purchase_group_key: string | null;
  purchase_group_code: string | null;
  group_sequence: number | null;
  purchase_order_items: Array<{
    id: number;
    ingredient_id: number;
    quantity: number | string;
    entry_unit_id: number;
    supplier_id?: number | null;
    ingredients: NamedEmbed;
    units: UnitEmbed;
  }>;
};

type PurchaseOrderItemRecord = PurchaseOrderRecord["purchase_order_items"][number] & {
  po_id: number;
};

type GrnRecord = {
  id: number;
  po_id: number | null;
  grn_number: string;
  status: string;
  received_date: string | null;
  grn_items: Array<{
    purchase_order_item_id: number | null;
    received_quantity: number | string;
    rejected_quantity: number | string;
    confirmed_at?: string | null;
  }>;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function uniqueIds(values: Iterable<number>): number[] {
  return [...new Set(values)];
}

function chunkIds(
  values: readonly number[],
  chunkSize = PURCHASE_WORKSPACE_IN_CHUNK_SIZE,
): number[][] {
  const ids = uniqueIds(values);
  if (ids.length === 0) return [];

  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

async function fetchRowsInChunks<T>({
  ids,
  fetchChunk,
}: {
  ids: readonly number[];
  fetchChunk: (
    chunkIds: number[],
  ) => Promise<{ data: T[] | null; error: unknown | null }>;
}): Promise<{ data: T[]; error: unknown | null }> {
  if (ids.length === 0) return { data: [], error: null };

  const rows: T[] = [];
  for (const idChunk of chunkIds(ids)) {
    const { data, error } = await fetchChunk(idChunk);
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}

function unitLabel(units: UnitEmbed): string {
  return one(units)?.name ?? one(units)?.code ?? "Đơn vị";
}

export function mapPurchaseDemandRows({
  demands,
  coverageOrders,
  allocations,
  unitFactors,
  branchNames,
  supplierNames,
}: {
  demands: DemandRecord[];
  coverageOrders: CoverageOrderRecord[];
  allocations: AllocationRecord[];
  unitFactors: UnitFactorRecord[];
  branchNames: Map<number, string>;
  supplierNames: Map<number, string>;
}): PurchaseRequestRow[] {
  const factorByIngredientUnit = new Map<string, number>();
  for (const unit of unitFactors) {
    const factor = Number(unit.to_base_factor);
    if (!Number.isFinite(factor) || factor <= 0) continue;
    factorByIngredientUnit.set(`${unit.ingredient_id}:${unit.unit_id}`, factor);
  }

  const ordersByDemandId = new Map<number, CoverageOrderRecord[]>();
  for (const po of coverageOrders) {
    if (po.purchase_request_id == null) continue;
    const list = ordersByDemandId.get(po.purchase_request_id) ?? [];
    list.push(po);
    ordersByDemandId.set(po.purchase_request_id, list);
  }

  const allocationsByDemandId = new Map<number, AllocationRecord[]>();
  for (const allocation of allocations) {
    const list = allocationsByDemandId.get(allocation.purchase_request_id) ?? [];
    list.push(allocation);
    allocationsByDemandId.set(allocation.purchase_request_id, list);
  }

  return demands.map((request): PurchaseRequestRow => {
    const linkedOrders = ordersByDemandId.get(request.id) ?? [];
    const orderedLinesByItem = new Map<
      number,
      Array<{ quantity: number; entryToBaseFactor: number }>
    >();
    for (const po of linkedOrders) {
      if (po.status === "cancelled") continue;
      for (const line of po.purchase_order_items ?? []) {
        if (line.purchase_request_item_id == null) continue;
        const factor = Number(line.entry_to_base_factor);
        const lines =
          orderedLinesByItem.get(line.purchase_request_item_id) ?? [];
        lines.push({
          quantity: Number(line.quantity),
          entryToBaseFactor: Number.isFinite(factor) ? factor : 0,
        });
        orderedLinesByItem.set(line.purchase_request_item_id, lines);
      }
    }

    const items = (request.purchase_request_items ?? []).map((item) => {
      const demandFactor =
        factorByIngredientUnit.get(`${item.ingredient_id}:${item.entry_unit_id}`) ??
        0;
      const { orderedQuantity, remainingQuantity } = purchaseDemandLineProgress(
        {
          demandQuantity: Number(item.quantity),
          demandToBaseFactor: demandFactor,
          orderedLines: orderedLinesByItem.get(item.id) ?? [],
        },
      );
      return {
        id: item.id,
        ingredientId: item.ingredient_id,
        ingredientName: one(item.ingredients)?.name ?? "Nguyên liệu",
        quantity: Number(item.quantity),
        orderedQuantity,
        remainingQuantity,
        entryUnitId: item.entry_unit_id,
        unitLabel: unitLabel(item.units),
        notes: item.notes,
      };
    });

    return {
      id: request.id,
      code: request.request_number,
      branchId: request.branch_id,
      branchName: branchNames.get(request.branch_id) ?? `#${request.branch_id}`,
      status: request.status,
      statusReason: request.status_reason,
      neededBy: request.needed_by,
      notes: request.notes,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      lineCount: items.length,
      orderedLineCount: items.filter((item) => item.remainingQuantity === 0)
        .length,
      items,
      allocations: (allocationsByDemandId.get(request.id) ?? []).map(
        (allocation) => ({
          requestItemId: allocation.purchase_request_item_id,
          supplierId: allocation.supplier_id,
          quantity: Number(allocation.quantity),
        }),
      ),
      purchaseOrders: linkedOrders.map((po) => ({
        id: po.id,
        code: po.display_id ?? po.po_number,
        status: po.status,
        supplierName:
          po.supplier_id != null
            ? (supplierNames.get(po.supplier_id) ?? "Nhà cung cấp")
            : messages.inventory.po.multiSupplierBadge,
      })),
    };
  });
}

export function mapPurchaseOrderRows({
  orders,
  grns,
  branchNames,
  supplierNames,
}: {
  orders: PurchaseOrderRecord[];
  grns: GrnRecord[];
  branchNames: Map<number, string>;
  supplierNames: Map<number, string>;
}): PurchaseOrderRow[] {
  const grnsByPoId = new Map<number, GrnRecord[]>();
  for (const grn of grns) {
    if (grn.po_id == null) continue;
    const list = grnsByPoId.get(grn.po_id) ?? [];
    list.push(grn);
    grnsByPoId.set(grn.po_id, list);
  }

  return orders.map((po): PurchaseOrderRow => {
    const linked = grnsByPoId.get(po.id) ?? [];
    const linkedGrns = linked.map((grn) => ({
      id: grn.id,
      code: grn.grn_number,
      status: grn.status,
      receivedAt: grn.received_date,
    }));
    const receivedByLine = new Map<number, number>();
    for (const grn of linked) {
      for (const line of grn.grn_items ?? []) {
        const booked =
          grn.status === "confirmed" || line.confirmed_at != null;
        if (!booked) continue;
        if (line.purchase_order_item_id == null) continue;
        receivedByLine.set(
          line.purchase_order_item_id,
          (receivedByLine.get(line.purchase_order_item_id) ?? 0) +
            Number(line.received_quantity) -
            Number(line.rejected_quantity),
        );
      }
    }
    const lineSupplierIds = uniqueIds(
      (po.purchase_order_items ?? []).flatMap((line) =>
        line.supplier_id != null && line.supplier_id > 0
          ? [line.supplier_id]
          : po.supplier_id != null
            ? [po.supplier_id]
            : [],
      ),
    );
    const supplierName =
      po.supplier_id != null
        ? (supplierNames.get(po.supplier_id) ??
          messages.inventory.po.supplierRequired)
        : lineSupplierIds.length > 1
          ? messages.inventory.po.multiSupplierBadge
          : (supplierNames.get(lineSupplierIds[0] ?? 0) ??
            messages.inventory.po.supplierRequired);
    return {
      id: po.id,
      code: po.display_id ?? po.po_number,
      groupKey: po.purchase_group_key,
      groupCode: po.purchase_group_code,
      groupSequence: po.group_sequence,
      status: po.status,
      statusReason: po.status_reason,
      orderedAt: po.ordered_at,
      expectedDeliveryDate: po.expected_delivery_date,
      notes: po.notes,
      supplierId: po.supplier_id,
      supplierIds: lineSupplierIds,
      supplierName,
      branchId: po.branch_id,
      branchName:
        branchNames.get(po.branch_id) ?? messages.inventory.po.branchLabel,
      lines: (po.purchase_order_items ?? []).map((line) => ({
        id: line.id,
        ingredientId: line.ingredient_id,
        ingredientName: one(line.ingredients)?.name ?? "Nguyên liệu",
        quantity: Number(line.quantity),
        receivedQuantity: receivedByLine.get(line.id) ?? 0,
        entryUnitId: line.entry_unit_id,
        unitLabel: unitLabel(line.units),
        supplierId: line.supplier_id ?? po.supplier_id,
        supplierName:
          (line.supplier_id != null
            ? supplierNames.get(line.supplier_id)
            : null) ??
          (po.supplier_id != null
            ? supplierNames.get(po.supplier_id)
            : null) ??
          messages.inventory.po.supplierRequired,
      })),
      linkedGrns,
      activeDraftGrnId:
        linkedGrns.find((grn) => grn.status === "draft")?.id ?? null,
    };
  });
}

export async function loadPurchaseDemandRows({
  supabase,
  tenantId,
  branchId,
  canAllocate,
  branchNames,
  supplierNames,
}: {
  supabase: TenantSupabase;
  tenantId: number;
  branchId?: number | null;
  canAllocate: boolean;
  branchNames: Map<number, string>;
  supplierNames: Map<number, string>;
}): Promise<{ success: true; rows: PurchaseRequestRow[] } | { success: false }> {
  let demandQuery = supabase
    .from("purchase_requests" as never)
    .select(DEMAND_LIST_SELECT as never)
    .eq("tenant_id" as never, tenantId)
    .order("updated_at" as never, { ascending: false })
    .limit(PURCHASE_WORKSPACE_LIST_LIMIT);
  if (branchId != null) {
    demandQuery = demandQuery.eq("branch_id" as never, branchId as never);
  }

  const demandResult = await demandQuery;
  if (demandResult.error) return { success: false };

  const demandHeaders = (demandResult.data ?? []) as unknown as Array<
    Omit<DemandRecord, "purchase_request_items">
  >;
  const demandIds = uniqueIds(demandHeaders.map((demand) => demand.id));

  const emptyItems = { data: [] as DemandItemRecord[], error: null };
  const emptyCoverage = {
    data: [] as Omit<CoverageOrderRecord, "purchase_order_items">[],
    error: null,
  };
  const emptyAllocations = { data: [] as AllocationRecord[], error: null };

  const [itemResult, coverageResult, allocationResult, factorResult] =
    await Promise.all([
      demandIds.length === 0
        ? emptyItems
        : fetchRowsInChunks({
            ids: demandIds,
            fetchChunk: async (idChunk) =>
              supabase
                .from("purchase_request_items" as never)
                .select(DEMAND_ITEM_SELECT as never)
                .eq("tenant_id" as never, tenantId)
                .in("purchase_request_id" as never, idChunk as never),
          }),
      demandIds.length === 0
        ? emptyCoverage
        : supabase
            .from("purchase_orders")
            .select(DEMAND_COVERAGE_SELECT)
            .eq("tenant_id", tenantId)
            .in("purchase_request_id", demandIds),
      canAllocate && demandIds.length > 0
        ? fetchRowsInChunks({
            ids: demandIds,
            fetchChunk: async (idChunk) =>
              supabase
                .from("purchase_request_allocations")
                .select(
                  "purchase_request_id, purchase_request_item_id, supplier_id, quantity",
                )
                .eq("tenant_id", tenantId)
                .in("purchase_request_id", idChunk),
          })
        : emptyAllocations,
      supabase
        .from("ingredient_units")
        .select("ingredient_id, unit_id, to_base_factor")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
    ]);

  const coverageHeaders = (coverageResult.data ?? []) as unknown as Array<
    Omit<CoverageOrderRecord, "purchase_order_items">
  >;
  const coveragePoIds = uniqueIds(coverageHeaders.map((po) => po.id));
  const coverageItemResult =
    coveragePoIds.length === 0
      ? {
          data: [] as Array<{
            po_id: number;
            purchase_request_item_id: number | null;
            quantity: number | string;
            entry_to_base_factor: number | string | null;
          }>,
          error: null,
        }
      : await fetchRowsInChunks({
          ids: coveragePoIds,
          fetchChunk: async (idChunk) =>
            supabase
              .from("purchase_order_items")
              .select(DEMAND_COVERAGE_ITEM_SELECT)
              .eq("tenant_id", tenantId)
              .in("po_id", idChunk),
        });

  if (
    itemResult.error ||
    coverageResult.error ||
    coverageItemResult.error ||
    allocationResult.error ||
    factorResult.error
  ) {
    return { success: false };
  }

  const demandItems = itemResult.data as DemandItemRecord[];
  const itemsByDemandId = new Map<number, DemandRecord["purchase_request_items"]>();
  for (const item of demandItems) {
    const list = itemsByDemandId.get(item.purchase_request_id) ?? [];
    list.push(item);
    itemsByDemandId.set(item.purchase_request_id, list);
  }
  const demands: DemandRecord[] = demandHeaders.map((demand) => ({
    ...demand,
    purchase_request_items: itemsByDemandId.get(demand.id) ?? [],
  }));

  const coverageItemsByPoId = new Map<
    number,
    CoverageOrderRecord["purchase_order_items"]
  >();
  for (const item of (coverageItemResult.data ?? []) as Array<{
    po_id: number;
    purchase_request_item_id: number | null;
    quantity: number | string;
    entry_to_base_factor: number | string | null;
  }>) {
    const list = coverageItemsByPoId.get(item.po_id) ?? [];
    list.push({
      purchase_request_item_id: item.purchase_request_item_id,
      quantity: item.quantity,
      entry_to_base_factor: item.entry_to_base_factor,
    });
    coverageItemsByPoId.set(item.po_id, list);
  }
  const coverageOrders: CoverageOrderRecord[] = coverageHeaders.map((po) => ({
    ...po,
    purchase_order_items: coverageItemsByPoId.get(po.id) ?? [],
  }));

  return {
    success: true,
    rows: mapPurchaseDemandRows({
      demands,
      coverageOrders,
      allocations: (allocationResult.data ??
        []) as unknown as AllocationRecord[],
      unitFactors: (factorResult.data ?? []) as unknown as UnitFactorRecord[],
      branchNames,
      supplierNames,
    }),
  };
}

export async function loadPurchaseOrderRows({
  supabase,
  tenantId,
  branchId,
  branchNames,
  supplierNames,
}: {
  supabase: TenantSupabase;
  tenantId: number;
  branchId?: number | null;
  branchNames: Map<number, string>;
  supplierNames: Map<number, string>;
}): Promise<{ success: true; rows: PurchaseOrderRow[] } | { success: false }> {
  let poQuery = supabase
    .from("purchase_orders")
    .select(ORDER_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("ordered_at", { ascending: false })
    .limit(PURCHASE_WORKSPACE_LIST_LIMIT);
  if (branchId != null) {
    poQuery = poQuery.eq("branch_id", branchId);
  }

  const poResult = await poQuery;
  if (poResult.error) return { success: false };

  type GrnItemRecord = GrnRecord["grn_items"][number] & { grn_id: number };

  const orderHeaders = (poResult.data ?? []) as unknown as Array<
    Omit<PurchaseOrderRecord, "purchase_order_items">
  >;
  const poIds = uniqueIds(orderHeaders.map((po) => po.id));
  const [itemResult, grnHeaderResult] = await Promise.all([
    poIds.length === 0
      ? { data: [] as PurchaseOrderItemRecord[], error: null }
      : fetchRowsInChunks({
          ids: poIds,
          fetchChunk: async (idChunk) =>
            supabase
              .from("purchase_order_items")
              .select(ORDER_ITEM_SELECT as never)
              .eq("tenant_id", tenantId)
              .in("po_id", idChunk),
        }),
    poIds.length === 0
      ? { data: [] as Omit<GrnRecord, "grn_items">[], error: null }
      : fetchRowsInChunks({
          ids: poIds,
          fetchChunk: async (idChunk) =>
            supabase
              .from("goods_received_notes")
              .select(GRN_BY_PO_SELECT)
              .eq("tenant_id", tenantId)
              .in("po_id", idChunk),
        }),
  ]);

  if (itemResult.error || grnHeaderResult.error) return { success: false };

  const poItems = itemResult.data as PurchaseOrderItemRecord[];
  const itemsByPoId = new Map<number, PurchaseOrderRecord["purchase_order_items"]>();
  for (const item of poItems) {
    const list = itemsByPoId.get(item.po_id) ?? [];
    list.push(item);
    itemsByPoId.set(item.po_id, list);
  }
  const orders: PurchaseOrderRecord[] = orderHeaders.map((po) => ({
    ...po,
    purchase_order_items: itemsByPoId.get(po.id) ?? [],
  }));

  const grnHeaders = (grnHeaderResult.data ??
    []) as unknown as Omit<GrnRecord, "grn_items">[];
  const grnIds = uniqueIds(grnHeaders.map((grn) => grn.id));
  const grnItemResult =
    grnIds.length === 0
      ? { data: [] as GrnItemRecord[], error: null }
      : await fetchRowsInChunks({
          ids: grnIds,
          fetchChunk: async (idChunk) =>
            supabase
              .from("grn_items")
              .select(
                "grn_id, purchase_order_item_id, received_quantity, rejected_quantity, confirmed_at" as never,
              )
              .eq("tenant_id", tenantId)
              .in("grn_id", idChunk),
        });

  if (grnItemResult.error) return { success: false };

  const itemsByGrnId = new Map<number, GrnRecord["grn_items"]>();
  for (const item of grnItemResult.data as GrnItemRecord[]) {
    const list = itemsByGrnId.get(item.grn_id) ?? [];
    list.push({
      purchase_order_item_id: item.purchase_order_item_id,
      received_quantity: item.received_quantity,
      rejected_quantity: item.rejected_quantity,
      confirmed_at: item.confirmed_at ?? null,
    });
    itemsByGrnId.set(item.grn_id, list);
  }

  const grns: GrnRecord[] = grnHeaders.map((grn) => ({
    ...grn,
    grn_items: itemsByGrnId.get(grn.id) ?? [],
  }));

  return {
    success: true,
    rows: mapPurchaseOrderRows({
      orders,
      grns,
      branchNames,
      supplierNames,
    }),
  };
}

export type PurchasePickerUnit = {
  id: number;
  label: string;
  factor: number;
};

type UnitNameEmbed =
  | { code: string | null; name: string | null }
  | { code: string | null; name: string | null }[]
  | null;

/** Flat companion to `fetchIngredients({ includeUnits: false })` for YCM pickers. */
export async function loadPurchasePickerUnits(params: {
  supabase: TenantSupabase;
  tenantId: number;
}): Promise<Map<number, PurchasePickerUnit[]>> {
  const { data, error } = await params.supabase
    .from("ingredient_units")
    .select(
      "ingredient_id, unit_id, to_base_factor, units!ingredient_units_unit_tenant_fkey(code, name)",
    )
    .eq("tenant_id", params.tenantId)
    .eq("is_active", true);

  const byIngredient = new Map<number, PurchasePickerUnit[]>();
  if (error || data == null) return byIngredient;

  for (const row of data) {
    const unitsEmbed = row.units as UnitNameEmbed;
    const unit = Array.isArray(unitsEmbed) ? (unitsEmbed[0] ?? null) : unitsEmbed;
    const ingredientId = Number(row.ingredient_id);
    const list = byIngredient.get(ingredientId) ?? [];
    list.push({
      id: Number(row.unit_id),
      label: (unit?.name || unit?.code || "").trim() || String(row.unit_id),
      factor: Number(row.to_base_factor),
    });
    byIngredient.set(ingredientId, list);
  }
  return byIngredient;
}
