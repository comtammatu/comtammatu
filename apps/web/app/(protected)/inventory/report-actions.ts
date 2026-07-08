"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  INVENTORY_OPS_ROLES,
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import { getAuthContext, getAuthContextWithPermission } from "./_lib/auth";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

/* ─── Schemas ─── */

const stockMovementReportSchema = z.object({
  startDate: z.string().min(1, { error: "Ngày bắt đầu không hợp lệ" }),
  endDate: z.string().min(1, { error: "Ngày kết thúc không hợp lệ" }),
  branchId: z.coerce.number().int().positive().optional(),
});

/* ─── Types ─── */

export interface MovementReportRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  opening: number;
  grn_receipt: number;
  transfer_in: number;
  transfer_out: number;
  consumption: number;
  production_consumption: number;
  production_output: number;
  adjustment: number;
  closing: number;
}

export interface BranchMovementSummaryRow {
  branch_id: number;
  branch_name: string;
  grn_receipt: number;
  transfer_in: number;
  transfer_out: number;
  consumption: number;
  production_consumption: number;
  production_output: number;
  adjustment: number;
}

type IngredientUnitCodeJoin = {
  is_base: boolean;
  units: { code: string } | null;
};

type IngredientReportRow = {
  id: number;
  name: string;
  ingredient_units: IngredientUnitCodeJoin[];
};

/* ─── fetchStockMovementReport ─── */

export async function fetchStockMovementReport(
  input: z.input<typeof stockMovementReportSchema>,
): Promise<ActionResult<MovementReportRow[]>> {
  const parsed = stockMovementReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const { startDate, endDate, branchId } = parsed.data;

  // branch_manager is clamped to their own branch regardless of input.
  const effectiveBranchId =
    claims.user_role === "branch_manager" && claims.branch_id != null
      ? claims.branch_id
      : branchId;

  const { data, error } = await supabase.rpc("get_stock_movement_report", {
    p_start_date: startDate,
    p_end_date: endDate,
    p_branch_id: effectiveBranchId ?? undefined,
  });

  if (error) return { success: false, error: "Không tải được biến động kho." };

  const rows: MovementReportRow[] = (data ?? []).map((row) => ({
    ingredient_id: row.ingredient_id,
    ingredient_name: row.ingredient_name,
    unit: row.unit,
    opening: Number(row.opening),
    grn_receipt: Number(row.grn_receipt),
    transfer_in: Number(row.transfer_in),
    transfer_out: Number(row.transfer_out),
    consumption: Number(row.consumption),
    production_consumption: Number(row.production_consumption),
    production_output: Number(row.production_output),
    adjustment: Number(row.adjustment),
    closing: Number(row.closing),
  }));

  return { success: true, data: rows };
}

/* ─── fetchBranchMovementSummary ─── */

export async function fetchBranchMovementSummary(
  input: Pick<
    z.input<typeof stockMovementReportSchema>,
    "startDate" | "endDate"
  >,
): Promise<ActionResult<BranchMovementSummaryRow[]>> {
  const parsed = z
    .object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const { startDate, endDate } = parsed.data;
  const startRange = getVNDayUtcRange(startDate);
  const endRange = getVNDayUtcRange(endDate);

  // Get branches
  const { data: branches, error: brErr } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true);
  if (brErr) return { success: false, error: "Không tải được chi nhánh." };

  const branchMap = new Map(
    (branches ?? []).map((b) => [b.id, getBranchSiteDisplayName(b)] as const),
  );

  // Get movements grouped by branch
  let movQuery = supabase
    .from("stock_movements")
    .select("branch_id, type, quantity_change")
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", startRange.startIso)
    .lt("created_at", endRange.endIso);

  // branch_manager can only see their branch
  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    movQuery = movQuery.eq("branch_id", claims.branch_id);
  }

  const { data: movements, error: movErr } = await movQuery;
  if (movErr) return { success: false, error: "Không tải được biến động kho." };

  type MovType =
    | "grn_receipt"
    | "transfer_in"
    | "transfer_out"
    | "consumption"
    | "production_consumption"
    | "production_output"
    | "adjustment"
    | "count_adjustment";

  const byBranch = new Map<number, Record<MovType, number>>();

  for (const m of movements ?? []) {
    let entry = byBranch.get(m.branch_id);
    if (!entry) {
      entry = {
        grn_receipt: 0,
        transfer_in: 0,
        transfer_out: 0,
        consumption: 0,
        production_consumption: 0,
        production_output: 0,
        adjustment: 0,
        count_adjustment: 0,
      };
      byBranch.set(m.branch_id, entry);
    }
    const t = m.type as MovType;
    if (t in entry) {
      entry[t] += Number(m.quantity_change);
    }
  }

  const rows: BranchMovementSummaryRow[] = [];
  for (const [branchId, sums] of byBranch) {
    rows.push({
      branch_id: branchId,
      branch_name: branchMap.get(branchId) ?? `#${String(branchId)}`,
      grn_receipt: sums.grn_receipt,
      transfer_in: sums.transfer_in,
      transfer_out: sums.transfer_out,
      consumption: sums.consumption,
      production_consumption: sums.production_consumption,
      production_output: sums.production_output,
      adjustment: sums.adjustment + sums.count_adjustment,
    });
  }

  rows.sort((a, b) => a.branch_name.localeCompare(b.branch_name, "vi"));

  return { success: true, data: rows };
}

// ---------------------------------------------------------------------------
// AP Aging Report — unpaid/partial invoices bucketed by days overdue
// ---------------------------------------------------------------------------

interface ApAgingBucket {
  current: { count: number; total: number };
  days_1_30: { count: number; total: number };
  days_31_60: { count: number; total: number };
  days_61_90: { count: number; total: number };
  days_over_90: { count: number; total: number };
}

export interface ApAgingRow {
  supplier_id: number;
  supplier_name: string;
  buckets: ApAgingBucket;
  total_outstanding: number;
}

export async function fetchApAging(): Promise<ActionResult<ApAgingRow[]>> {
  const ctx = await getAuthContextWithPermission(
    PROCUREMENT_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_ap_aging");

  if (error) return { success: false, error: "Không tải được hóa đơn NCC." };
  if (!data || data.length === 0) return { success: true, data: [] };

  const rows: ApAgingRow[] = data.map((row) => ({
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    buckets: row.buckets as unknown as ApAgingBucket,
    total_outstanding: row.total_outstanding,
  }));

  return { success: true, data: rows };
}

// ---------------------------------------------------------------------------
// Consumption Variance Report — theoretical vs actual ingredient usage
// ---------------------------------------------------------------------------

const consumptionVarianceSchema = z.object({
  startDate: z.string().min(1, { error: "Ngày bắt đầu không hợp lệ" }),
  endDate: z.string().min(1, { error: "Ngày kết thúc không hợp lệ" }),
  branchId: z.coerce.number().int().positive().optional(),
});

export interface ConsumptionVarianceRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  theoretical: number;
  actual: number;
  variance: number;
  variance_pct: number;
  flag: "ok" | "warning" | "critical";
}

export async function fetchConsumptionVariance(
  input: z.input<typeof consumptionVarianceSchema>,
): Promise<ActionResult<ConsumptionVarianceRow[]>> {
  const parsed = consumptionVarianceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { startDate, endDate, branchId } = parsed.data;
  const startRange = getVNDayUtcRange(startDate);
  const endRange = getVNDayUtcRange(endDate);

  // Effective branch filter for branch_manager
  const effectiveBranchId =
    claims.user_role === "branch_manager" && claims.branch_id != null
      ? claims.branch_id
      : branchId;

  // 1. Theoretical consumption from completed orders in period
  //    SUM(order_items.quantity * recipes.quantity / recipes.yield_factor)
  //    grouped by ingredient
  let ordersQuery = supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["completed", "paid"])
    .gte("created_at", startRange.startIso)
    .lt("created_at", endRange.endIso);
  if (effectiveBranchId) {
    ordersQuery = ordersQuery.eq("branch_id", effectiveBranchId);
  }
  const { data: orders, error: ordErr } = await ordersQuery;
  if (ordErr) return { success: false, error: "Không tải được đơn hàng." };

  const orderIds = (orders ?? []).map((o) => o.id);

  // Get ingredient names for display
  const { data: ingredients, error: ingErr } = await supabase
    .from("ingredients")
    .select(
      "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code))",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true);
  if (ingErr) return { success: false, error: "Không tải được nguyên liệu." };
  const ingMap = new Map(
    ((ingredients ?? []) as IngredientReportRow[]).map((i) => {
      const baseUnit =
        i.ingredient_units.find((u) => u.is_base)?.units?.code || "kg";
      return [
        i.id,
        { name: i.name, unit: baseUnit },
      ];
    }),
  );

  // Compute theoretical: need order_items joined with recipes
  // Since we can't do a cross-table aggregation in supabase-js easily,
  // we fetch order_items + recipes separately and compute in JS
  const theoreticalMap = new Map<number, number>();

  if (orderIds.length > 0) {
    // Batch order_items in chunks of 200 to avoid URL length limits
    const chunkSize = 200;
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const { data: orderItems, error: oiErr } = await supabase
        .from("order_items")
        .select("menu_item_id, quantity")
        .eq("tenant_id", claims.tenant_id)
        .in("order_id", chunk)
        .neq("status", "cancelled");
      if (oiErr) continue;

      // For each order_item, look up recipes
      const menuItemIds = [
        ...new Set((orderItems ?? []).map((oi) => oi.menu_item_id)),
      ];
      if (menuItemIds.length === 0) continue;

      const { data: recipes, error: rErr } = await supabase
        .from("recipes")
        .select("menu_item_id, ingredient_id, quantity, yield_factor")
        .eq("tenant_id", claims.tenant_id)
        .in("menu_item_id", menuItemIds);
      if (rErr) continue;

      // Build a map: menu_item_id -> recipe lines
      const recipeMap = new Map<
        number,
        Array<{
          ingredient_id: number;
          quantity: number;
          yield_factor: number;
        }>
      >();
      for (const r of recipes ?? []) {
        const yf = Number(r.yield_factor ?? 1);
        let list = recipeMap.get(r.menu_item_id);
        if (!list) {
          list = [];
          recipeMap.set(r.menu_item_id, list);
        }
        list.push({
          ingredient_id: r.ingredient_id,
          quantity: Number(r.quantity),
          yield_factor: yf > 0 ? yf : 1,
        });
      }

      // Compute theoretical per ingredient
      for (const oi of orderItems ?? []) {
        const recipeLines = recipeMap.get(oi.menu_item_id);
        if (!recipeLines) continue;
        for (const rl of recipeLines) {
          const need = (oi.quantity * rl.quantity) / rl.yield_factor;
          theoreticalMap.set(
            rl.ingredient_id,
            (theoreticalMap.get(rl.ingredient_id) ?? 0) + need,
          );
        }
      }
    }
  }

  // 2. Actual sale consumption from stock_movements movement_subtype.
  // `type='consumption'` also includes writeoff/other operational issues.
  let movQuery = supabase
    .from("stock_movements")
    .select("ingredient_id, quantity_change")
    .eq("tenant_id", claims.tenant_id)
    .eq("movement_subtype", "sale_consumption")
    .gte("created_at", startRange.startIso)
    .lt("created_at", endRange.endIso);
  if (effectiveBranchId) {
    movQuery = movQuery.eq("branch_id", effectiveBranchId);
  }
  const { data: movements, error: movErr } = await movQuery;
  if (movErr) return { success: false, error: "Không tải được biến động kho." };

  const actualMap = new Map<number, number>();
  for (const m of movements ?? []) {
    // quantity_change is negative for consumption, take absolute
    actualMap.set(
      m.ingredient_id,
      (actualMap.get(m.ingredient_id) ?? 0) +
        Math.abs(Number(m.quantity_change)),
    );
  }

  // 3. Combine into variance rows
  // Include all ingredients that appear in either theoretical or actual
  const allIngIds = new Set([...theoreticalMap.keys(), ...actualMap.keys()]);
  const rows: ConsumptionVarianceRow[] = [];

  for (const ingId of allIngIds) {
    const theoretical = theoreticalMap.get(ingId) ?? 0;
    const actual = actualMap.get(ingId) ?? 0;
    const variance = actual - theoretical;
    const variancePct =
      theoretical > 0 ? (variance / theoretical) * 100 : actual > 0 ? 100 : 0;

    const flag: "ok" | "warning" | "critical" =
      Math.abs(variancePct) > 15
        ? "critical"
        : Math.abs(variancePct) > 7
          ? "warning"
          : "ok";

    const ingInfo = ingMap.get(ingId);
    // Skip ingredients with zero theoretical and zero actual
    if (theoretical === 0 && actual === 0) continue;

    rows.push({
      ingredient_id: ingId,
      ingredient_name: ingInfo?.name ?? `#${String(ingId)}`,
      unit: ingInfo?.unit ?? "",
      theoretical: Math.round(theoretical * 1000) / 1000,
      actual: Math.round(actual * 1000) / 1000,
      variance: Math.round(variance * 1000) / 1000,
      variance_pct: Math.round(variancePct * 10) / 10,
      flag,
    });
  }

  // Sort: critical first, then warning, then by |variance_pct| descending
  const flagOrder = { critical: 0, warning: 1, ok: 2 };
  rows.sort((a, b) => {
    const fo = flagOrder[a.flag] - flagOrder[b.flag];
    if (fo !== 0) return fo;
    return Math.abs(b.variance_pct) - Math.abs(a.variance_pct);
  });

  return { success: true, data: rows };
}
