"use server";

import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction, withActionPositional } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { fetchProcurementBranches } from "./_lib/procurement-branches";

const ROLES = PROCUREMENT_ROLES;

function isBranchScopedProcurementRole(role: string) {
  return role === "warehouse_manager" || role === "production_manager";
}

function canAccessProcurementBranch(
  claims: { user_role: string; branch_id: number | null },
  branchId: number,
) {
  return (
    !isBranchScopedProcurementRole(claims.user_role) ||
    claims.branch_id === branchId
  );
}

/* ─── fetchPurchaseOrdersPage ─── */

const PURCHASE_ORDER_SELECT =
  "id, po_number, display_id, status, ordered_at, notes, supplier_id, branch_id, created_by, suppliers ( id, name ), purchase_order_items ( line_total )";

const PURCHASE_ORDER_PAGE_SIZE = 50;

const PURCHASE_ORDER_FILTER_KEYS = [
  "draft",
  "sent",
  "partially_received",
  "received",
  "cancelled",
] as const;

export interface PurchaseOrderCursor {
  orderedAt: string;
  id: number;
}

export interface PurchaseOrderPage {
  items: unknown[];
  hasMore: boolean;
  nextCursor: PurchaseOrderCursor | null;
}

const purchaseOrderCursorSchema = z.object({
  orderedAt: z.string(),
  id: z.coerce.number().int().positive(),
});

const fetchPurchaseOrdersPaginatedSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  before: purchaseOrderCursorSchema.optional(),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .default(PURCHASE_ORDER_PAGE_SIZE),
});

/**
 * Keyset-paginated PO list (ordered_at desc, id desc tiebreaker). ordered_at
 * is DEFAULT now() NOT NULL with frequent ties, so the id tiebreaker is
 * required for stable paging. Mirrors fetchSupplierInvoicesPage: fetch
 * pageSize+1 to probe hasMore, slice to pageSize, expose the last row as
 * nextCursor. Scoped to tenant + optional branch.
 */
export async function fetchPurchaseOrdersPage(
  input: z.input<typeof fetchPurchaseOrdersPaginatedSchema> = {},
): Promise<ActionResult<PurchaseOrderPage>> {
  const parsed = fetchPurchaseOrdersPaginatedSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Tham số tải đơn đặt hàng không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { branchId, before, pageSize } = parsed.data;

  let query = supabase
    .from("purchase_orders")
    .select(PURCHASE_ORDER_SELECT)
    .eq("tenant_id", claims.tenant_id);
  if (branchId != null) query = query.eq("branch_id", branchId);

  if (before) {
    // Keyset: rows STRICTLY after the cursor under (ordered_at desc, id desc).
    // PostgREST has no composite "<", so OR two disjoint half-spaces.
    query = query.or(
      `ordered_at.lt.${before.orderedAt},and(ordered_at.eq.${before.orderedAt},id.lt.${String(before.id)})`,
    );
  }

  const { data, error } = await query
    .order("ordered_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (error) return { success: false, error: "Không thể tải đơn đặt hàng." };

  const fetched = (data ?? []) as unknown as Array<{
    id: number;
    ordered_at: string;
    [k: string]: unknown;
  }>;
  const hasMore = fetched.length > pageSize;
  const items = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? { orderedAt: last.ordered_at, id: last.id }
      : null;

  return { success: true, data: { items, hasMore, nextCursor } };
}

/**
 * Total PO count per status for the list filter tabs, independent of the
 * paginated window (count-only head queries, one per status). Keeps the
 * status-filter counts accurate without loading every PO into the client.
 */
export async function fetchPurchaseOrderStatusCounts(
  branchId?: number,
): Promise<ActionResult<Record<string, number>>> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const entries = await Promise.all(
    PURCHASE_ORDER_FILTER_KEYS.map(async (status) => {
      let q = supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .eq("status", status);
      if (branchId != null) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return [status, count ?? 0] as const;
    }),
  );

  return { success: true, data: Object.fromEntries(entries) };
}

/* ─── createPurchaseOrder ─── */

const poCreateSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  notes: z.string().max(500, { error: "Ghi chú tối đa 500 ký tự" }).optional(),
});

export const createPurchaseOrder = withAction(
  {
    roles: ROLES,
    schema: poCreateSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    const targetBranchId = data.branchId;

    // Branch-scoped roles must match their assigned procurement branch.
    if (!canAccessProcurementBranch(claims, targetBranchId)) {
      return { success: false, error: "Bạn chỉ được tạo PO cho kho của mình." };
    }

    const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
    if (!branches.some((branch) => branch.id === targetBranchId)) {
      return {
        success: false,
        error: "Chi nhánh không hợp lệ.",
      };
    }

    // F-017: allocate per-tenant per-year sequential display ID via atomic RPC.
    const { data: nextDisplay, error: seqErr } = await supabase.rpc(
      "next_po_display_id",
      { p_tenant_id: claims.tenant_id },
    );
    if (seqErr || !nextDisplay) {
      return { success: false, error: "Không thể cấp số PO." };
    }
    const displayId = String(nextDisplay);
    // Keep po_number == display_id; the po_number column is still referenced elsewhere
    // by audit_logs/exports/e-invoices.
    const poNumber = displayId;

    const { data: row, error } = await supabase
      .from("purchase_orders")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: targetBranchId,
        supplier_id: data.supplierId,
        po_number: poNumber,
        display_id: displayId,
        status: "draft",
        notes: data.notes ?? null,
        created_by: user.id,
      })
      .select("id, display_id")
      .single();
    if (error) {
      return { success: false, error: "Không thể tạo đơn đặt hàng." };
    }
    return { success: true, data: row };
  },
);

/* ─── createPurchaseOrderWithLines (atomic) ─── */

const poWithLinesSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  notes: z.string().max(500, { error: "Ghi chú tối đa 500 ký tự" }).optional(),
  lines: z
    .array(
      z.object({
        ingredientId: z.coerce.number().int().positive(),
        quantity: z.coerce
          .number()
          .positive({ error: "Số lượng phải lớn hơn 0" }),
        unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
        // Purchase-role unit the qty was entered in. NULL = already base unit;
        // the RPC converts to the ingredient base via inv_to_base().
        entryUnitId: z.coerce.number().int().positive().nullable().optional(),
        unitPriceEst: z.union([z.number().min(0), z.null()]).optional(),
      }),
    )
    .min(1, { error: "Thêm ít nhất 1 nguyên liệu" }),
});

export const createPurchaseOrderWithLines = withAction(
  {
    roles: ROLES,
    schema: poWithLinesSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (data, { supabase, claims }) => {
    if (!canAccessProcurementBranch(claims, data.branchId)) {
      return { success: false, error: "Bạn chỉ được tạo PO cho kho của mình." };
    }

    const { data: row, error } = await supabase.rpc(
      "create_purchase_order_with_lines",
      {
        p_supplier_id: data.supplierId,
        p_branch_id: data.branchId,
        p_notes: data.notes ?? "",
        p_lines: data.lines.map((l) => ({
          ingredient_id: l.ingredientId,
          quantity: l.quantity,
          unit: l.unit,
          entry_unit_id: l.entryUnitId ?? null,
          unit_price_est: l.unitPriceEst ?? null,
        })),
      },
    );

    if (error) {
      const byCode: Record<string, string> = {
        "42501": "Bạn không có quyền tạo PO cho kho này.",
        P0002: "Chi nhánh hoặc nhà cung cấp không hợp lệ.",
        "22023": "Dữ liệu dòng PO không hợp lệ.",
        "28000": "Phiên đăng nhập đã hết hạn.",
      };
      return {
        success: false,
        error: byCode[error.code ?? ""] ?? "Không thể tạo đơn đặt hàng.",
      };
    }

    const parsed = z
      .object({ id: z.coerce.number().int().positive() })
      .safeParse(row);
    if (!parsed.success) {
      return { success: false, error: "Phản hồi không hợp lệ từ máy chủ." };
    }
    return { success: true, data: { id: parsed.data.id } };
  },
);

/* ─── fetchPurchaseOrderDetail ─── */

export async function fetchPurchaseOrderDetail(
  poId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: po, error: e1 } = await supabase
    .from("purchase_orders")
    .select("*, suppliers ( id, name )")
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (e1 || !po)
    return { success: false, error: "Không tìm thấy đơn đặt hàng." };
  const { data: lines, error: e2 } = await supabase
    .from("purchase_order_items")
    .select("*, ingredients ( id, name, unit, purchase_unit )")
    .eq("po_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .order("id");
  if (e2)
    return { success: false, error: "Không thể tải chi tiết đơn đặt hàng." };
  return { success: true, data: { po, lines: lines ?? [] } };
}

/* ─── upsertPurchaseOrderLine ─── */

const poLineSchema = z.object({
  poId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive({ error: "Số lượng phải lớn hơn 0" }),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  // Purchase-role unit the qty was entered in. NULL = already base.
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  unitPriceEst: z.union([z.number().min(0), z.null()]).optional(),
});

export const upsertPurchaseOrderLine = withAction(
  {
    roles: ROLES,
    schema: poLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: po, error: pe } = await supabase
      .from("purchase_orders")
      .select("id, status, branch_id")
      .eq("id", data.poId)
      .eq("tenant_id", claims.tenant_id)
      .single();
    if (pe || !po) {
      return { success: false, error: "Không tìm thấy PO." };
    }
    // Owner force-edit: allow on draft/sent/partially_received/received.
    // Non-owner: still restricted to draft (existing behavior).
    const isOwner = claims.user_role === "owner";
    if (!isOwner && po.status !== "draft") {
      return {
        success: false,
        error: "Chỉ chỉnh sửa dòng khi PO đang ở trạng thái nháp.",
      };
    }
    if (po.status === "cancelled") {
      return {
        success: false,
        error: "Không thể sửa PO đã hủy.",
      };
    }
    if (!canAccessProcurementBranch(claims, po.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa PO của kho mình.",
      };
    }

    const unitPrice = data.unitPriceEst ?? null;
    const lineTotal =
      unitPrice != null ? Number((data.quantity * unitPrice).toFixed(2)) : null;
    const { data: row, error } = await supabase
      .from("purchase_order_items")
      .upsert(
        {
          tenant_id: claims.tenant_id,
          po_id: data.poId,
          ingredient_id: data.ingredientId,
          quantity: data.quantity,
          unit: data.unit,
          entry_unit_id: data.entryUnitId ?? null,
          unit_price_est: unitPrice,
          line_total: lineTotal,
        },
        { onConflict: "po_id,ingredient_id,tenant_id" },
      )
      .select("id")
      .single();
    if (error || !row) {
      return { success: false, error: "Không thể lưu dòng PO." };
    }
    return { success: true, data: row };
  },
);

/* ─── deletePurchaseOrderLine ─── */

const deletePoLineSchema = z.object({
  poId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
});

export const deletePurchaseOrderLine = withAction(
  {
    roles: ROLES,
    schema: deletePoLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: po, error: pe } = await supabase
      .from("purchase_orders")
      .select("id, status, branch_id")
      .eq("id", data.poId)
      .eq("tenant_id", claims.tenant_id)
      .single();
    if (pe || !po) {
      return { success: false, error: "Không tìm thấy PO." };
    }
    const isOwner = claims.user_role === "owner";
    if (!isOwner && po.status !== "draft") {
      return {
        success: false,
        error: "Chỉ xóa dòng khi PO đang ở trạng thái nháp.",
      };
    }
    if (po.status === "cancelled") {
      return {
        success: false,
        error: "Không thể sửa PO đã hủy.",
      };
    }
    if (!canAccessProcurementBranch(claims, po.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa PO của kho mình.",
      };
    }

    const { error } = await supabase
      .from("purchase_order_items")
      .delete()
      .eq("id", data.lineId)
      .eq("po_id", data.poId)
      .eq("tenant_id", claims.tenant_id);
    if (error) {
      return { success: false, error: "Không thể xóa dòng." };
    }
    return { success: true };
  },
);

/* ─── updatePurchaseOrderStatus ─── */

const poStatusSchema = z.object({
  poId: z.coerce.number().int().positive(),
  status: z.enum(["sent", "cancelled"]),
});

export const updatePurchaseOrderStatus = withActionPositional(
  {
    argsToInput: (poId: number, status: string) => ({ poId, status }),
    schema: poStatusSchema,
    roles: ROLES,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async ({ poId, status }, { supabase, claims }): Promise<ActionResult> => {
    const { data: po, error: pe } = await supabase
      .from("purchase_orders")
      .select("id, status, branch_id")
      .eq("id", poId)
      .eq("tenant_id", claims.tenant_id)
      .single();
    if (pe || !po) return { success: false, error: "Không tìm thấy PO." };
    if (!canAccessProcurementBranch(claims, po.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được cập nhật PO của kho mình.",
      };
    }

    if (status === "sent" && po.status !== "draft") {
      return {
        success: false,
        error: "Chỉ gửi PO khi PO đang ở trạng thái nháp.",
      };
    }

    if (
      status === "cancelled" &&
      po.status !== "draft" &&
      po.status !== "sent"
    ) {
      return {
        success: false,
        error: "Chỉ hủy PO nháp hoặc PO đã gửi nhưng chưa nhận hàng.",
      };
    }

    if (status === "cancelled" && po.status === "sent") {
      const { count, error: grnError } = await supabase
        .from("goods_received_notes")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .eq("po_id", po.id)
        .neq("status", "cancelled");

      if (grnError) {
        return { success: false, error: "Không thể kiểm tra phiếu nhận hàng." };
      }
      if ((count ?? 0) > 0) {
        return {
          success: false,
          error:
            "PO đã có phiếu nhận hàng nên không thể hủy trực tiếp. Hãy xử lý bằng điều chỉnh/đối soát GRN.",
        };
      }
    }

    const { data: updated, error } = await supabase
      .from("purchase_orders")
      .update({ status })
      .eq("id", poId)
      .eq("tenant_id", claims.tenant_id)
      .eq("status", po.status)
      .select("id")
      .maybeSingle();
    if (error)
      return { success: false, error: "Không thể cập nhật trạng thái PO." };
    if (!updated) {
      return {
        success: false,
        error: "Trạng thái PO đã thay đổi. Vui lòng tải lại và thử lại.",
      };
    }
    return { success: true };
  },
);

/* ─── fetchOpenPurchaseOrdersForReceiving ─── */

export interface OpenPurchaseOrderRow {
  id: number;
  po_number: string;
  status: "sent" | "partially_received";
  ordered_at: string | null;
  supplier_id: number;
  supplier_name: string;
  line_count: number;
  total_est: number | null;
}

export async function fetchOpenPurchaseOrdersForReceiving(): Promise<
  ActionResult<OpenPurchaseOrderRow[]>
> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, ordered_at, branch_id, supplier_id, suppliers ( name ), purchase_order_items ( line_total )",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["sent", "partially_received"])
    .order("ordered_at", { ascending: false })
    .limit(100);

  if (
    (claims.user_role === "warehouse_manager" ||
      claims.user_role === "production_manager") &&
    claims.branch_id != null
  ) {
    query = query.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải PO chờ nhận." };

  const rows: OpenPurchaseOrderRow[] = (data ?? [])
    .map((po) => {
      const lines =
        (po.purchase_order_items as Array<{
          line_total: number | null;
        }> | null) ?? [];
      const hasAllPrices =
        lines.length > 0 && lines.every((l) => l.line_total != null);
      const total = hasAllPrices
        ? lines.reduce((s, l) => s + Number(l.line_total), 0)
        : null;
      return {
        id: po.id,
        po_number: po.po_number,
        status: po.status as "sent" | "partially_received",
        ordered_at: po.ordered_at,
        supplier_id: po.supplier_id,
        supplier_name:
          (po.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
        line_count: lines.length,
        total_est: total,
      };
    })
    .filter((row) => row.line_count > 0);

  return { success: true, data: rows };
}

/* ─── PO Suggestions ─── */

const poSuggestionsSchema = z.object({
  // Every level carries the same copy so the wrapped helper (which surfaces
  // `issues[0]?.message`) yields the identical generic "Dữ liệu không hợp lệ"
  // the pre-helper hand-rolled `safeParse` returned for any field failure.
  branchId: z.coerce
    .number({ error: "Dữ liệu không hợp lệ" })
    .int({ error: "Dữ liệu không hợp lệ" })
    .positive({ error: "Dữ liệu không hợp lệ" }),
  periodDays: z
    .union([z.literal(7), z.literal(14), z.literal(30)], {
      error: "Dữ liệu không hợp lệ",
    })
    .default(7),
});

export interface PoSuggestionRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  hq_current_qty: number;
  reorder_point: number;
  max_stock_level: number;
  suggested_qty: number;
  avg_daily_consumption: number;
  period_days: number;
  below_reorder: boolean;
}

// branchId is required; callers must pick an explicit procurement branch.
export const fetchPoSuggestions = withAction(
  {
    roles: ROLES,
    schema: poSuggestionsSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_READ,
  },
  async (data, { supabase, claims }): Promise<ActionResult> => {
    const { branchId, periodDays: rawPeriod } = data;
    const periodDays = rawPeriod;

    // Branch-scoped procurement roles must stay within their assigned branch.
    if (!canAccessProcurementBranch(claims, branchId)) {
      return {
        success: false,
        error: "Bạn chỉ được xem gợi ý cho kho của mình.",
      };
    }

    // Validate branchId points to a procurement branch in this tenant.
    const procBranches = await fetchProcurementBranches(
      supabase,
      claims.tenant_id,
    );
    const target = procBranches.find((b) => b.id === branchId);
    if (!target) {
      return {
        success: false,
        error: "Chi nhánh không hợp lệ.",
      };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);

    // 1. Stock levels at the selected procurement branch for active ingredients with reorder_point.
    const { data: hqStock, error: e1 } = await supabase
      .from("stock_levels")
      .select(
        `
      ingredient_id,
      current_quantity,
      ingredients!inner (
        id, name, unit, purchase_unit, reorder_point, max_stock_level, is_active
      )
    `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("ingredients.is_active", true)
      .not("ingredients.reorder_point", "is", null);

    if (e1)
      return { success: false, error: "Không thể tải tồn kho chi nhánh." };

    // 2. Consumption aggregated tenant-wide over the period.
    // Proxy until branches.primary_warehouse_id FK exists (see inventory.md §10).
    // The same consumption pool feeds every branch suggestion.
    const { data: movements, error: e2 } = await supabase
      .from("stock_movements")
      .select("ingredient_id, quantity_change")
      .eq("tenant_id", claims.tenant_id)
      .eq("type", "consumption")
      .gte("created_at", cutoff.toISOString());

    if (e2) return { success: false, error: "Không thể tải dữ liệu tiêu thụ." };

    // Aggregate consumption per ingredient (quantity_change is negative for consumption)
    const consumptionMap = new Map<number, number>();
    for (const m of movements ?? []) {
      const prev = consumptionMap.get(m.ingredient_id) ?? 0;
      consumptionMap.set(m.ingredient_id, prev + Math.abs(m.quantity_change));
    }

    // 3. Build suggestion rows
    const suggestions: PoSuggestionRow[] = [];

    for (const sl of hqStock ?? []) {
      const ing = sl.ingredients as unknown as {
        id: number;
        name: string;
        unit: string;
        purchase_unit: string | null;
        reorder_point: number;
        max_stock_level: number | null;
      };
      if (!ing || ing.reorder_point == null) continue;

      const maxStock = ing.max_stock_level ?? 0;
      const currentQty = sl.current_quantity;
      const suggestedQty = Math.max(0, maxStock - currentQty);
      const totalConsumed = consumptionMap.get(ing.id) ?? 0;
      const avgDaily = totalConsumed / periodDays;
      const belowReorder = currentQty <= ing.reorder_point;

      // Only suggest if below reorder OR has consumption data and space to restock
      if (!belowReorder && suggestedQty <= 0) continue;

      suggestions.push({
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.purchase_unit ?? ing.unit,
        hq_current_qty: currentQty,
        reorder_point: ing.reorder_point,
        max_stock_level: maxStock,
        suggested_qty: suggestedQty,
        avg_daily_consumption: Math.round(avgDaily * 100) / 100,
        period_days: periodDays,
        below_reorder: belowReorder,
      });
    }

    // Sort: below reorder first, then by consumption rate descending
    suggestions.sort((a, b) => {
      if (a.below_reorder !== b.below_reorder) return a.below_reorder ? -1 : 1;
      return b.avg_daily_consumption - a.avg_daily_consumption;
    });

    return { success: true, data: suggestions };
  },
);

/* ─── Price Intelligence ─── */

export interface SinglePriceDeviation {
  avg_price: number;
  deviation_pct: number;
  sample_count: number;
}

const singleDeviationSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive(),
  currentPrice: z.coerce.number().min(0),
});

export const fetchSinglePriceDeviation = withAction(
  {
    roles: ROLES,
    schema: singleDeviationSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_READ,
  },
  async (data, { supabase, claims }) => {
    const { data: history } = await supabase
      .from("grn_items")
      .select(
        "unit_cost, goods_received_notes!inner ( supplier_id, status, received_date )",
      )
      .eq("ingredient_id", data.ingredientId)
      .eq("tenant_id", claims.tenant_id)
      .eq("goods_received_notes.supplier_id", data.supplierId)
      .eq("goods_received_notes.status", "confirmed")
      .order("received_date", {
        referencedTable: "goods_received_notes",
        ascending: false,
      })
      .limit(3);

    if (!history || history.length === 0) return { success: true, data: null };

    const avgPrice =
      history.reduce((sum, h) => sum + h.unit_cost, 0) / history.length;
    if (avgPrice === 0) return { success: true, data: null };

    const deviationPct = ((data.currentPrice - avgPrice) / avgPrice) * 100;

    const result: SinglePriceDeviation = {
      avg_price: Math.round(avgPrice * 100) / 100,
      deviation_pct: Math.round(deviationPct * 10) / 10,
      sample_count: history.length,
    };
    return { success: true, data: result };
  },
);
