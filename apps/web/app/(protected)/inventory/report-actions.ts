"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  INVENTORY_OPS_ROLES,
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import {
  diffVNDateDays,
  getVNDateString,
  getVNDayUtcRange,
} from "@comtammatu/shared/time";
import { getAuthContext, getAuthContextWithPermission } from "./_lib/auth";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

const REPORT_ROLES: readonly StaffRole[] = ["owner"];

/* ─── Schemas ─── */

const stockMovementReportSchema = z.object({
  startDate: z.string().min(1, { error: "Ngày bắt đầu không hợp lệ" }),
  endDate: z.string().min(1, { error: "Ngày kết thúc không hợp lệ" }),
  branchId: z.coerce.number().int().positive().optional(),
});

const fetchFoodCostSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
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

export async function fetchFoodCost(
  input?: z.infer<typeof fetchFoodCostSchema>,
): Promise<ActionResult> {
  const parsed = fetchFoodCostSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: "Tham số không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // mv_food_cost direct SELECT was revoked in 20260426023632; use the
  // SECURITY DEFINER wrapper. NULL branch = all branches caller can access.
  const { data, error } = await supabase.rpc("get_food_cost", {
    p_branch_id: parsed.data.branchId ?? undefined,
    p_start_date: parsed.data.startDate ?? undefined,
    p_end_date: parsed.data.endDate ?? undefined,
  });

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu giá vốn món." };
  }

  return { success: true, data: data ?? [] };
}

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
  const startRange = getVNDayUtcRange(startDate);
  const endRange = getVNDayUtcRange(endDate);

  // Effective branch filter for branch_manager
  const effectiveBranchId =
    claims.user_role === "branch_manager" && claims.branch_id != null
      ? claims.branch_id
      : branchId;

  // 1. Get all ingredients
  const { data: ingredients, error: ingErr } = await supabase
    .from("ingredients")
    .select("id, name, unit, purchase_unit")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  if (ingErr) return { success: false, error: "Không tải được nguyên liệu." };

  // 2. Get current stock levels (for computing opening balance)
  let levelsQuery = supabase
    .from("stock_levels")
    .select("ingredient_id, current_quantity")
    .eq("tenant_id", claims.tenant_id);
  if (effectiveBranchId) {
    levelsQuery = levelsQuery.eq("branch_id", effectiveBranchId);
  }
  const { data: levels, error: levErr } = await levelsQuery;
  if (levErr) return { success: false, error: "Không tải được tồn kho." };

  // Sum current_quantity per ingredient (across branches if no filter)
  const currentByIngredient = new Map<number, number>();
  for (const lv of levels ?? []) {
    currentByIngredient.set(
      lv.ingredient_id,
      (currentByIngredient.get(lv.ingredient_id) ?? 0) +
        Number(lv.current_quantity),
    );
  }

  // 3. Get movements in the period
  let movQuery = supabase
    .from("stock_movements")
    .select("ingredient_id, type, quantity_change")
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", startRange.startIso)
    .lt("created_at", endRange.endIso);
  if (effectiveBranchId) {
    movQuery = movQuery.eq("branch_id", effectiveBranchId);
  }
  const { data: movements, error: movErr } = await movQuery;
  if (movErr) return { success: false, error: "Không tải được biến động kho." };

  // 4. Get movements AFTER the period (to compute opening balance)
  // opening = current_quantity - sum(movements from startDate to now)
  // But more accurately: opening = current - movements_in_and_after_period
  // closing = opening + movements_in_period = current - movements_after_period
  let afterQuery = supabase
    .from("stock_movements")
    .select("ingredient_id, quantity_change")
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", endRange.endIso);
  if (effectiveBranchId) {
    afterQuery = afterQuery.eq("branch_id", effectiveBranchId);
  }
  const { data: afterMovements, error: afterErr } = await afterQuery;
  if (afterErr)
    return { success: false, error: "Không tải được biến động kho." };

  // Sum after-period movements per ingredient
  const afterSumByIngredient = new Map<number, number>();
  for (const m of afterMovements ?? []) {
    afterSumByIngredient.set(
      m.ingredient_id,
      (afterSumByIngredient.get(m.ingredient_id) ?? 0) +
        Number(m.quantity_change),
    );
  }

  // 5. Build report rows
  type MovementType =
    | "grn_receipt"
    | "transfer_in"
    | "transfer_out"
    | "consumption"
    | "production_consumption"
    | "production_output"
    | "adjustment"
    | "count_adjustment";

  const periodSums = new Map<number, Record<MovementType, number>>();

  for (const m of movements ?? []) {
    let entry = periodSums.get(m.ingredient_id);
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
      periodSums.set(m.ingredient_id, entry);
    }
    const t = m.type as MovementType;
    if (t in entry) {
      entry[t] += Number(m.quantity_change);
    }
  }

  const rows: MovementReportRow[] = [];
  for (const ing of ingredients ?? []) {
    const sums = periodSums.get(ing.id);
    const current = currentByIngredient.get(ing.id) ?? 0;
    const afterSum = afterSumByIngredient.get(ing.id) ?? 0;

    // closing = current - afterSum (movements after period)
    const closing = current - afterSum;
    // opening = closing - sum of all movements in period
    const periodTotal = sums
      ? sums.grn_receipt +
        sums.transfer_in +
        sums.transfer_out +
        sums.consumption +
        sums.production_consumption +
        sums.production_output +
        sums.adjustment +
        sums.count_adjustment
      : 0;
    const opening = closing - periodTotal;

    // Only include ingredients that have stock or movements
    if (opening !== 0 || closing !== 0 || periodTotal !== 0) {
      rows.push({
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.purchase_unit || ing.unit,
        opening,
        grn_receipt: sums?.grn_receipt ?? 0,
        transfer_in: sums?.transfer_in ?? 0,
        transfer_out: sums?.transfer_out ?? 0,
        consumption: sums?.consumption ?? 0,
        production_consumption: sums?.production_consumption ?? 0,
        production_output: sums?.production_output ?? 0,
        adjustment: (sums?.adjustment ?? 0) + (sums?.count_adjustment ?? 0),
        closing,
      });
    }
  }

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
  const { supabase, claims } = ctx;

  // Fetch unpaid/partial invoices with supplier info
  const { data: invoices, error } = await supabase
    .from("supplier_invoices")
    .select(
      "id, supplier_id, total_amount, paid_amount, due_date, payment_status, suppliers ( id, name )",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("payment_status", ["unpaid", "partial"]);

  if (error) return { success: false, error: "Không tải được hóa đơn NCC." };
  if (!invoices || invoices.length === 0) return { success: true, data: [] };

  const today = getVNDateString();

  const emptyBucket = (): ApAgingBucket => ({
    current: { count: 0, total: 0 },
    days_1_30: { count: 0, total: 0 },
    days_31_60: { count: 0, total: 0 },
    days_61_90: { count: 0, total: 0 },
    days_over_90: { count: 0, total: 0 },
  });

  const bySupplier = new Map<
    number,
    { name: string; buckets: ApAgingBucket; total: number }
  >();

  for (const inv of invoices) {
    const supplierId = inv.supplier_id;
    const supplierObj = inv.suppliers as unknown as {
      id: number;
      name: string;
    } | null;
    const supplierName = supplierObj?.name ?? `NCC #${String(supplierId)}`;

    if (!bySupplier.has(supplierId)) {
      bySupplier.set(supplierId, {
        name: supplierName,
        buckets: emptyBucket(),
        total: 0,
      });
    }
    const entry = bySupplier.get(supplierId)!;

    const totalAmount = Number(inv.total_amount);
    const paidAmount = Number(inv.paid_amount ?? 0);
    const outstanding = totalAmount - paidAmount;
    entry.total += outstanding;

    // Determine aging bucket
    const dueDate = inv.due_date;
    let bucket: keyof ApAgingBucket;
    if (!dueDate) {
      // No due date — treat as current
      bucket = "current";
    } else {
      const daysOverdue = diffVNDateDays(dueDate, today);
      if (daysOverdue <= 0) {
        bucket = "current";
      } else if (daysOverdue <= 30) {
        bucket = "days_1_30";
      } else if (daysOverdue <= 60) {
        bucket = "days_31_60";
      } else if (daysOverdue <= 90) {
        bucket = "days_61_90";
      } else {
        bucket = "days_over_90";
      }
    }

    entry.buckets[bucket].count += 1;
    entry.buckets[bucket].total += outstanding;
  }

  const rows: ApAgingRow[] = [];
  for (const [supplierId, entry] of bySupplier) {
    rows.push({
      supplier_id: supplierId,
      supplier_name: entry.name,
      buckets: entry.buckets,
      total_outstanding: Math.round(entry.total * 100) / 100,
    });
  }

  rows.sort((a, b) => b.total_outstanding - a.total_outstanding);

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
    .select("id, name, unit, purchase_unit")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true);
  if (ingErr) return { success: false, error: "Không tải được nguyên liệu." };
  const ingMap = new Map(
    (ingredients ?? []).map((i) => [
      i.id,
      { name: i.name, unit: i.purchase_unit || i.unit },
    ]),
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
