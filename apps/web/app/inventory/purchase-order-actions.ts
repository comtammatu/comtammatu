"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "../_lib/with-action";
import { getAuthContext } from "./_lib/auth";
import { fetchHeadquartersBranchId } from "./_lib/headquarters";

const ROLES = PROCUREMENT_ROLES;

/* ─── fetchPurchaseOrders ─── */

export async function fetchPurchaseOrders(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, ordered_at, notes, supplier_id, branch_id, created_by, suppliers ( id, name ), purchase_order_items ( line_total )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false });
  if (error) return { success: false, error: "Không thể tải đơn đặt hàng." };
  return { success: true, data: data ?? [] };
}

/* ─── createPurchaseOrder ─── */

const poCreateSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  notes: z.string().optional(),
});

export const createPurchaseOrder = withAction(
  { roles: ROLES, schema: poCreateSchema },
  async (data, { supabase, claims, user }) => {
    const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
    if (!hqId) {
      return { success: false, error: "Chưa cấu hình chi nhánh Trụ sở." };
    }
    const poNumber = `PO-${randomUUID().slice(0, 8)}`;
    const { data: row, error } = await supabase
      .from("purchase_orders")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: hqId,
        supplier_id: data.supplierId,
        po_number: poNumber,
        status: "draft",
        notes: data.notes ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      return { success: false, error: "Không thể tạo đơn đặt hàng." };
    }
    return { success: true, data: row };
  },
);

/* ─── fetchPurchaseOrderDetail ─── */

export async function fetchPurchaseOrderDetail(
  poId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
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
    .select("*, ingredients ( id, name, unit )")
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
  unitPriceEst: z.union([z.number().min(0), z.null()]).optional(),
});

export const upsertPurchaseOrderLine = withAction(
  { roles: ROLES, schema: poLineSchema },
  async (data, { supabase, claims }) => {
    const { data: po, error: pe } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", data.poId)
      .eq("tenant_id", claims.tenant_id)
      .single();
    if (pe || !po) {
      return { success: false, error: "Không tìm thấy PO." };
    }
    if (po.status !== "draft") {
      return {
        success: false,
        error: "Chỉ chỉnh sửa dòng khi PO đang ở trạng thái nháp.",
      };
    }
    const unitPrice = data.unitPriceEst ?? null;
    const lineTotal =
      unitPrice != null
        ? Number((data.quantity * unitPrice).toFixed(2))
        : null;
    const { error } = await supabase.from("purchase_order_items").upsert(
      {
        tenant_id: claims.tenant_id,
        po_id: data.poId,
        ingredient_id: data.ingredientId,
        quantity: data.quantity,
        unit: data.unit,
        unit_price_est: unitPrice,
        line_total: lineTotal,
      },
      { onConflict: "po_id,ingredient_id,tenant_id" },
    );
    if (error) {
      return { success: false, error: "Không thể lưu dòng PO." };
    }
    return { success: true };
  },
);

/* ─── deletePurchaseOrderLine ─── */

const deletePoLineSchema = z.object({
  poId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
});

export const deletePurchaseOrderLine = withAction(
  { roles: ROLES, schema: deletePoLineSchema },
  async (data, { supabase, claims }) => {
    const { data: po, error: pe } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", data.poId)
      .eq("tenant_id", claims.tenant_id)
      .single();
    if (pe || !po) {
      return { success: false, error: "Không tìm thấy PO." };
    }
    if (po.status !== "draft") {
      return {
        success: false,
        error: "Chỉ xóa dòng khi PO đang ở trạng thái nháp.",
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

// Skip withAction: positional (poId, status) args
export async function updatePurchaseOrderStatus(
  poId: number,
  status: string,
): Promise<ActionResult> {
  const parsed = poStatusSchema.safeParse({ poId, status });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: po, error: pe } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", parsed.data.poId)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (pe || !po) return { success: false, error: "Không tìm thấy PO." };
  if (po.status !== "draft") {
    return {
      success: false,
      error: "Chỉ gửi/hủy PO đang ở trạng thái nháp.",
    };
  }
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.poId)
    .eq("tenant_id", claims.tenant_id);
  if (error)
    return { success: false, error: "Không thể cập nhật trạng thái PO." };
  return { success: true };
}

/* ─── PO Suggestions ─── */

const poSuggestionsSchema = z.object({
  periodDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7),
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

// Skip withAction: optional input parameter
export async function fetchPoSuggestions(input?: {
  periodDays?: 7 | 14 | 30;
}): Promise<ActionResult> {
  const parsed = poSuggestionsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
  if (!hqId) {
    return { success: false, error: "Chưa cấu hình chi nhánh Trụ sở." };
  }

  const periodDays = parsed.data.periodDays;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);

  // 1. HQ stock levels for active ingredients with reorder_point
  const { data: hqStock, error: e1 } = await supabase
    .from("stock_levels")
    .select(
      `
      ingredient_id,
      current_quantity,
      ingredients!inner (
        id, name, unit, reorder_point, max_stock_level, is_active
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", hqId)
    .eq("ingredients.is_active", true)
    .not("ingredients.reorder_point", "is", null);

  if (e1) return { success: false, error: "Không thể tải tồn kho HQ." };

  // 2. Consumption data across ALL branches over the period
  const { data: movements, error: e2 } = await supabase
    .from("stock_movements")
    .select("ingredient_id, quantity_change")
    .eq("tenant_id", claims.tenant_id)
    .eq("type", "consumption")
    .gte("created_at", cutoff.toISOString());

  if (e2)
    return { success: false, error: "Không thể tải dữ liệu tiêu thụ." };

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
      unit: ing.unit,
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
}

/* ─── Price Intelligence ─── */

export interface PriceDeviationRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  current_price: number;
  avg_price: number;
  deviation_pct: number; // positive = more expensive, negative = cheaper
  sample_count: number;
}

const priceDeviationsSchema = z.object({
  poId: z.coerce.number().int().positive(),
});

export const fetchPriceDeviations = withAction(
  { roles: ROLES, schema: priceDeviationsSchema },
  async (data, { supabase, claims }) => {
    // 1. Fetch PO with supplier_id
    const { data: po, error: e1 } = await supabase
      .from("purchase_orders")
      .select("id, supplier_id")
      .eq("id", data.poId)
      .eq("tenant_id", claims.tenant_id)
      .single();
    if (e1 || !po) return { success: false, error: "Không tìm thấy PO." };

    // 2. Fetch PO lines that have a price estimate
    const { data: lines, error: e2 } = await supabase
      .from("purchase_order_items")
      .select("ingredient_id, unit_price_est, unit, ingredients ( id, name )")
      .eq("po_id", po.id)
      .eq("tenant_id", claims.tenant_id)
      .not("unit_price_est", "is", null);
    if (e2)
      return { success: false, error: "Không thể tải dòng đơn đặt hàng." };
    if (!lines || lines.length === 0) return { success: true, data: [] };

    // 3. For each line, get last 3 confirmed GRN unit_costs for same ingredient + supplier
    const deviations: PriceDeviationRow[] = [];

    for (const line of lines) {
      const { data: history } = await supabase
        .from("grn_items")
        .select(
          "unit_cost, goods_received_notes!inner ( supplier_id, status, received_date )",
        )
        .eq("ingredient_id", line.ingredient_id)
        .eq("tenant_id", claims.tenant_id)
        .eq("goods_received_notes.supplier_id", po.supplier_id)
        .eq("goods_received_notes.status", "confirmed")
        .order("received_date", {
          referencedTable: "goods_received_notes",
          ascending: false,
        })
        .limit(3);

      if (!history || history.length === 0) continue;

      const avgPrice =
        history.reduce((sum, h) => sum + h.unit_cost, 0) / history.length;
      if (avgPrice === 0) continue;

      const currentPrice = line.unit_price_est!;
      const deviationPct = ((currentPrice - avgPrice) / avgPrice) * 100;

      if (Math.abs(deviationPct) > 5) {
        const ing = line.ingredients as unknown as {
          id: number;
          name: string;
        } | null;
        deviations.push({
          ingredient_id: line.ingredient_id,
          ingredient_name: ing?.name ?? `#${line.ingredient_id}`,
          unit: line.unit,
          current_price: currentPrice,
          avg_price: Math.round(avgPrice * 100) / 100,
          deviation_pct: Math.round(deviationPct * 10) / 10,
          sample_count: history.length,
        });
      }
    }

    return { success: true, data: deviations };
  },
);

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
  { roles: ROLES, schema: singleDeviationSchema },
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

    const deviationPct =
      ((data.currentPrice - avgPrice) / avgPrice) * 100;

    const result: SinglePriceDeviation = {
      avg_price: Math.round(avgPrice * 100) / 100,
      deviation_pct: Math.round(deviationPct * 10) / 10,
      sample_count: history.length,
    };
    return { success: true, data: result };
  },
);

export interface PriceHistoryRow {
  grn_id: number;
  grn_number: string;
  received_date: string;
  unit_cost: number;
  received_quantity: number;
  unit: string;
  supplier_name: string;
  supplier_id: number;
}

const priceHistorySchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive().optional(),
});

export const fetchIngredientPriceHistory = withAction(
  { roles: ROLES, schema: priceHistorySchema },
  async (data, { supabase, claims }) => {
    let query = supabase
      .from("grn_items")
      .select(
        "grn_id, unit_cost, received_quantity, unit, goods_received_notes!inner ( id, grn_number, received_date, status, supplier_id, suppliers ( id, name ) )",
      )
      .eq("ingredient_id", data.ingredientId)
      .eq("tenant_id", claims.tenant_id)
      .eq("goods_received_notes.status", "confirmed")
      .order("received_date", {
        referencedTable: "goods_received_notes",
        ascending: false,
      })
      .limit(20);

    if (data.supplierId) {
      query = query.eq(
        "goods_received_notes.supplier_id",
        data.supplierId,
      );
    }

    const { data: rows, error } = await query;
    if (error)
      return { success: false, error: "Không thể tải lịch sử giá." };

    const result: PriceHistoryRow[] = (rows ?? []).map((item) => {
      const grn = item.goods_received_notes as unknown as {
        id: number;
        grn_number: string;
        received_date: string;
        supplier_id: number;
        suppliers: { id: number; name: string } | null;
      };
      return {
        grn_id: grn.id,
        grn_number: grn.grn_number,
        received_date: grn.received_date,
        unit_cost: item.unit_cost,
        received_quantity: item.received_quantity,
        unit: item.unit,
        supplier_name: grn.suppliers?.name ?? "\u2014",
        supplier_id: grn.supplier_id,
      };
    });

    return { success: true, data: result };
  },
);
