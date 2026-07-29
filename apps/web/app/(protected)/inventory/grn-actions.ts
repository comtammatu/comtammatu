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
import { resolveSoleGrnWarehouseLocation } from "@lib/inventory/grn-create-model";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";
import { allocateInventoryDocNumber } from "./_lib/inventory-doc-number";
import { fetchProcurementBranches } from "./_lib/procurement-branches";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";

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

/* ─── Recent Activity (cross-domain) ─── */

export type RecentActivityItem = {
  id: number;
  type: "po" | "grn" | "invoice";
  code: string;
  supplier: string;
  date: string; // ISO datetime
  status: string;
  monetary: { total: number } | null;
};

export async function fetchRecentActivity(
  branchId?: number,
): Promise<ActionResult<RecentActivityItem[]>> {
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
  let poQuery = (
    monetary.purchasePrice
      ? readClient
          .from("purchase_orders")
          .select(
            "id, po_number, status, ordered_at, suppliers ( name ), purchase_order_items ( line_total )",
          )
      : readClient
          .from("purchase_orders")
          .select(
            "id, po_number, status, ordered_at, suppliers ( name ), purchase_order_items ( id )",
          )
  )
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false })
    .limit(5);
  let grnQuery = supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, status, received_date, suppliers ( name ), grn_items ( id )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false })
    .limit(5);
  const invQuery = (
    monetary.purchasePrice
      ? readClient
          .from("supplier_invoices")
          .select(
            "id, invoice_number, matching_status, invoice_date, total_amount, suppliers ( name )",
          )
      : readClient
          .from("supplier_invoices")
          .select(
            "id, invoice_number, matching_status, invoice_date, suppliers ( name )",
          )
  )
    .eq("tenant_id", claims.tenant_id)
    .order("invoice_date", { ascending: false })
    .limit(5);

  if (branchId != null) {
    poQuery = poQuery.eq("branch_id", branchId);
    grnQuery = grnQuery.eq("branch_id", branchId);
    // supplier_invoices has no branch_id — left tenant-wide intentionally.
  }

  const [poRes, grnRes, invRes] = await Promise.all([
    poQuery,
    grnQuery,
    invQuery,
  ]);

  if (poRes.error || grnRes.error || invRes.error) {
    return {
      success: false,
      error: messages.inventory.grn.recentActivityLoadFailed,
    };
  }

  const items: RecentActivityItem[] = [
    ...(poRes.data ?? []).map((po) => {
      const lines =
        (po.purchase_order_items as Array<{
          line_total: number | null;
        }> | null) ?? [];
      const hasAllPrices =
        lines.length > 0 && lines.every((l) => l.line_total != null);
      const total =
        monetary.purchasePrice && hasAllPrices
          ? lines.reduce((s, l) => s + Number(l.line_total), 0)
          : null;
      return {
        id: po.id,
        type: "po" as const,
        code: po.po_number,
        supplier:
          (po.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
        date: po.ordered_at ?? "",
        status: po.status,
        monetary: total == null ? null : { total },
      };
    }),
    ...(grnRes.data ?? []).map((grn) => ({
      id: grn.id,
      type: "grn" as const,
      code: grn.grn_number,
      supplier:
        (grn.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
      date: grn.received_date ?? "",
      status: grn.status,
      monetary: null,
    })),
    ...(invRes.data ?? []).map((inv) => ({
      id: inv.id,
      type: "invoice" as const,
      code: inv.invoice_number,
      supplier:
        (inv.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
      date: inv.invoice_date ?? "",
      status: inv.matching_status,
      monetary:
        monetary.purchasePrice && "total_amount" in inv && inv.total_amount
          ? { total: Number(inv.total_amount) }
          : null,
    })),
  ];

  items.sort((a, b) => (b.date > a.date ? 1 : -1));

  return { success: true, data: items.slice(0, 5) };
}

/* ─── fetchGrns ─── */

export async function fetchGrns(branchId?: number): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  let query = supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, status, received_date, notes, supplier_id, branch_id, po_id, branches ( id, name ), suppliers ( id, name ), purchase_orders!goods_received_notes_po_id_fkey ( id, po_number, status ), purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey ( id, po_number, status ), grn_items ( id, rejected_quantity, supplier_id, suppliers ( id, name ) ), supplier_invoices ( id )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false })
    .limit(100);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) return { success: false, error: grnLoadFailedError };
  return { success: true, data: data ?? [] };
}

/* ─── fetchGrnIdsForDropdown ─── */

type GrnDropdownLine = {
  received_quantity?: number | null;
  rejected_quantity?: number | null;
  unit_cost?: number | null;
  supplier_id?: number | null;
  suppliers?: { id: number; name: string } | null;
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
  linkedPairs: Set<string>,
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
      const pairKey = `${row.id}:${supplierId}`;
      if (
        linkedPairs.has(pairKey) &&
        (includeGrnId == null || includeGrnId !== row.id)
      ) {
        continue;
      }

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
      });
    }
  }

  return options;
}

export async function fetchGrnIdsForDropdown(
  branchId?: number,
  includeGrnId?: number,
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

  const { data: linkedRows, error: linkedError } = await supabase
    .from("supplier_invoices")
    .select("grn_id, supplier_id")
    .eq("tenant_id", claims.tenant_id)
    .not("grn_id", "is", null);
  if (linkedError) return { success: false, error: grnLoadFailedError };
  const linkedPairs = new Set(
    (linkedRows ?? [])
      .map((row) => {
        const grnId = Number(row.grn_id);
        const supplierId = Number(row.supplier_id);
        if (
          !Number.isSafeInteger(grnId) ||
          grnId <= 0 ||
          !Number.isSafeInteger(supplierId) ||
          supplierId <= 0
        ) {
          return null;
        }
        return `${grnId}:${supplierId}`;
      })
      .filter((value): value is string => value != null),
  );

  const selectWithNet =
    "id, grn_number, supplier_id, po_id, suppliers ( id, name ), purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey ( id, supplier_id ), grn_items ( received_quantity, rejected_quantity, unit_cost, supplier_id, suppliers ( id, name ) )";
  const selectWithoutNet =
    "id, grn_number, supplier_id, po_id, suppliers ( id, name ), purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey ( id, supplier_id ), grn_items ( supplier_id, suppliers ( id, name ) )";

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

  return {
    success: true,
    data: expandGrnDropdownOptions(
      (data ?? []) as GrnDropdownRow[],
      linkedPairs,
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
  if (!lookup) return { success: false, error: "ID không hợp lệ" };
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
      (monetary.purchasePrice
        ? "id, grn_id, tenant_id, ingredient_id, supplier_id, purchase_order_item_id, po_applied_quantity, received_quantity, rejected_quantity, rejection_reason, rejected_photo_url, entry_unit_id, unit_cost, total_cost, suppliers ( id, name ), ingredients ( id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code)) ), purchase_order_items(quantity, unit_price_est)"
        : "id, grn_id, tenant_id, ingredient_id, supplier_id, purchase_order_item_id, po_applied_quantity, received_quantity, rejected_quantity, rejection_reason, rejected_photo_url, entry_unit_id, suppliers ( id, name ), ingredients ( id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code)) ), purchase_order_items(quantity)") as never,
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
    total_cost?: number | string;
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
      | { quantity: number | string; unit_price_est?: number | string | null }
      | Array<{
          quantity: number | string;
          unit_price_est?: number | string | null;
        }>
      | null;
  }>;
  const poItemIds = lines.flatMap((line) =>
    line.purchase_order_item_id == null ? [] : [line.purchase_order_item_id],
  );
  const [{ data: invoice }, { data: linkedPos }, previousResult] =
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
    ]);
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
      previously_applied_quantity:
        line.purchase_order_item_id == null
          ? 0
          : (previouslyApplied.get(line.purchase_order_item_id) ?? 0),
      monetary: monetary.purchasePrice
        ? {
            unit_price:
              poLine?.unit_price_est == null
                ? null
                : Number(poLine.unit_price_est),
            total_cost: Number(line.total_cost ?? 0),
          }
        : null,
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

/* ─── createGrnDraft ─── */

const grnCreateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const createGrnDraft = withAction(
  {
    roles: ROLES,
    schema: grnCreateSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    const targetBranchId = data.branchId;

    // Branch-scoped roles must match their assigned procurement branch.
    if (!canAccessProcurementBranch(claims, targetBranchId)) {
      return {
        success: false,
        error: "Bạn chỉ được tạo phiếu nhập cho kho của mình.",
      };
    }

    const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
    if (!branches.some((branch) => branch.id === targetBranchId)) {
      return {
        success: false,
        error: "Chi nhánh không hợp lệ.",
      };
    }

    let targetLocationId: number;
    if (
      isBranchScopedProcurementRole(claims.user_role) ||
      data.locationId == null
    ) {
      const { data: locations, error: locationError } = await supabase
        .from("inventory_locations")
        .select("id")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", targetBranchId)
        .eq("is_active", true)
        .eq("location_kind", "warehouse")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .limit(2);
      if (locationError) {
        return {
          success: false,
          error: messages.inventory.grn.warehouseLoadFailed,
        };
      }
      const resolution = resolveSoleGrnWarehouseLocation(locations ?? []);
      if (resolution.status === "missing") {
        return {
          success: false,
          error: messages.inventory.grn.warehouseMissing,
        };
      }
      if (resolution.status === "ambiguous") {
        return {
          success: false,
          error: messages.inventory.grn.warehouseAmbiguous,
        };
      }
      targetLocationId = resolution.locationId;
    } else {
      const { data: location, error: locationError } = await supabase
        .from("inventory_locations")
        .select("id")
        .eq("id", data.locationId)
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", targetBranchId)
        .eq("is_active", true)
        .eq("location_kind", "warehouse")
        .maybeSingle();
      if (locationError || !location) {
        return { success: false, error: "Nơi nhập hàng không hợp lệ." };
      }
      targetLocationId = location.id;
    }

    const allocated = await allocateInventoryDocNumber(
      supabase,
      claims.tenant_id,
      "grn",
    );
    if (!allocated.ok) {
      return { success: false, error: messages.inventory.grn.createFailed };
    }
    const grnNumber = allocated.code;
    const { data: row, error } = await supabase
      .from("goods_received_notes")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: targetBranchId,
        location_id: targetLocationId,
        supplier_id: null,
        po_id: null,
        grn_number: grnNumber,
        status: "draft",
        notes: data.notes ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      // Concurrent create on the same user+branch free draft: return existing.
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("goods_received_notes")
          .select("id")
          .eq("tenant_id", claims.tenant_id)
          .eq("created_by", user.id)
          .eq("branch_id", targetBranchId)
          .eq("status", "draft")
          .is("po_id", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          return { success: true, data: { id: existing.id } };
        }
      }
      return { success: false, error: "Không thể tạo phiếu nhập." };
    }
    return { success: true, data: row };
  },
);

/* ─── loadActiveGrnDraft (Sprint 6 #3) ─── */

const loadActiveDraftSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

export const loadActiveGrnDraft = withAction(
  {
    roles: ROLES,
    schema: loadActiveDraftSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    const { data: row, error } = await supabase
      .from("goods_received_notes")
      .select(
        "id, branch_id, location_id, po_id, supplier_id, grn_number, notes, updated_at",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("created_by", user.id)
      .eq("branch_id", data.branchId)
      .eq("status", "draft")
      .is("po_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return {
        success: false,
        error: messages.inventory.grn.activeDraftLoadFailed,
      };
    }
    return { success: true, data: row ?? null };
  },
);

/* ─── listMyGrnDrafts (Sprint 6 #3) ─── */

export async function listMyGrnDrafts(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;
  let query = supabase
    .from("goods_received_notes")
    .select(
      "id, supplier_id, branch_id, po_id, grn_number, updated_at, branches ( id, name ), suppliers ( id, name ), purchase_orders!goods_received_notes_po_id_fkey ( id, po_number, status ), purchase_orders_source:purchase_orders!purchase_orders_source_grn_id_fkey ( id, po_number, status ), grn_items ( id, rejected_quantity, supplier_id, suppliers ( id, name ) )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("created_by", user.id)
    .eq("status", "draft")
    .is("po_id", null);
  // Branch-scope drafts on the operator plane so a multi-branch user does not
  // see (and Continue into) another branch's draft; Owner surface (branchId omitted)
  // keeps the cross-branch view.
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { data, error } = await query.order("updated_at", {
    ascending: false,
  });
  if (error) {
    return {
      success: false,
      error: messages.inventory.grn.draftListLoadFailed,
    };
  }
  return { success: true, data: data ?? [] };
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

const grnLineSchema = z
  .object({
    grnId: z.coerce.number().int().positive(),
    lineId: z.coerce.number().int().positive().optional(),
    ingredientId: z.coerce.number().int().positive(),
    supplierId: z.coerce.number().int().positive(),
    // "Số đã giao" (gross delivered). Stock impact = receivedQuantity − rejectedQuantity.
    receivedQuantity: z.coerce.number().min(0).max(GRN_NUMERIC_15_3_MAX),
    // Purchase-role unit the qty was entered in. NULL = already base.
    entryUnitId: z.coerce.number().int().positive().nullable().optional(),
    rejectedQuantity: z.coerce
      .number()
      .min(0)
      .max(GRN_NUMERIC_15_3_MAX)
      .optional(),
    rejectionReason: z.string().trim().max(500).optional().nullable(),
    rejectedPhotoUrl: z.string().trim().url().optional().nullable(),
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
        })
        .eq("id", data.lineId)
        .eq("grn_id", data.grnId)
        .eq("tenant_id", claims.tenant_id)
        .eq("ingredient_id", data.ingredientId)
        .select("id")
        .maybeSingle();
      if (error || !row) {
        return { success: false, error: "Không thể lưu dòng phiếu nhập." };
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
        } as never,
        { onConflict: "grn_id,ingredient_id,tenant_id" },
      )
      .select("id")
      .single();
    if (error?.message.includes("supplier_item_mapping_required")) {
      return {
        success: false,
        error: "Nguyên liệu chưa được gán cho nhà cung cấp.",
      };
    }
    if (error || !row) {
      return { success: false, error: "Không thể lưu dòng phiếu nhập." };
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
          receivedQuantity: z.coerce
            .number()
            .min(0)
            .max(GRN_NUMERIC_15_3_MAX),
          rejectedQuantity: z.coerce
            .number()
            .min(0)
            .max(GRN_NUMERIC_15_3_MAX)
            .default(0),
          rejectionReason: z.string().trim().max(500).nullable().optional(),
          rejectedPhotoUrl: z.string().trim().url().nullable().optional(),
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
        })),
      } as never,
    );
    if (error) {
      console.error("inventory.grn.save_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: "Không thể lưu phiếu nhập." };
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
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
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
    if (error.message.includes("grn_qc_quantity_mismatch")) {
      return {
        success: false,
        error: messages.inventory.grn.confirmQcQuantityInvalid,
      };
    }
    if (error.message.includes("grn_qc_reason_required")) {
      return {
        success: false,
        error: messages.inventory.grn.confirmQcReasonRequired,
      };
    }
    if (error.message.includes("grn_qc_photo_required")) {
      return {
        success: false,
        error: messages.inventory.grn.confirmQcPhotoRequired,
      };
    }
    if (error.message.includes("grn_rejection_evidence_required")) {
      return {
        success: false,
        error: messages.inventory.grn.confirmQcEvidenceRequired,
      };
    }
    if (error.message.includes("grn_has_no_accepted_quantity")) {
      return {
        success: false,
        error: messages.inventory.grn.confirmNoAcceptedQuantity,
      };
    }
    if (error.message.includes("grn_confirm_requires_approved_po")) {
      return {
        success: false,
        error: messages.inventory.grn.confirmRequiresApprovedPo,
      };
    }
    if (error.message.includes("grn_not_draft")) {
      return {
        success: false,
        error: messages.inventory.grn.confirmNotDraft,
      };
    }
    return { success: false, error: messages.inventory.grn.confirmFailed };
  }

  revalidatePath("/inventory/grn");

  return { success: true, data };
}

/* ─── amendGrnLine (Owner force-edit on confirmed GRN) ─── */

const amendGrnLineSchema = z
  .object({
    grnId: z.coerce.number().int().positive(),
    lineId: z.coerce.number().int().positive(),
    receivedQuantity: z.coerce
      .number()
      .min(0, {
        error: "Số lượng phải >= 0",
      })
      .max(GRN_NUMERIC_15_3_MAX, {
        error: "Số lượng vượt giới hạn hệ thống.",
      }),
    rejectedQuantity: z.coerce
      .number()
      .min(0)
      .max(GRN_NUMERIC_15_3_MAX, {
        error: "Số lượng từ chối vượt giới hạn hệ thống.",
      })
      .optional()
      .nullable(),
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
        return { success: false, error: "Chỉ Owner được sửa phiếu đã chốt." };
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
          error: "Số lượng vượt giới hạn hệ thống. Kiểm tra lại đơn vị nhập.",
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
