"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { getAuthContext } from "../_lib/auth";

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
  adjustment: number;
}

export interface InTransitTransfer {
  id: number;
  transfer_number: string;
  status: string;
  from_branch_name: string;
  to_branch_name: string;
  shipped_at: string | null;
  item_count: number;
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

  // Effective branch filter for branch_manager
  const effectiveBranchId =
    claims.user_role === "branch_manager" && claims.branch_id != null
      ? claims.branch_id
      : branchId;

  // 1. Get all ingredients
  const { data: ingredients, error: ingErr } = await supabase
    .from("ingredients")
    .select("id, name, unit")
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
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);
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
    .gt("created_at", `${endDate}T23:59:59`);
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
        sums.adjustment +
        sums.count_adjustment
      : 0;
    const opening = closing - periodTotal;

    // Only include ingredients that have stock or movements
    if (opening !== 0 || closing !== 0 || periodTotal !== 0) {
      rows.push({
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.unit,
        opening,
        grn_receipt: sums?.grn_receipt ?? 0,
        transfer_in: sums?.transfer_in ?? 0,
        transfer_out: sums?.transfer_out ?? 0,
        consumption: sums?.consumption ?? 0,
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

  // Get branches
  const { data: branches, error: brErr } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true);
  if (brErr) return { success: false, error: "Không tải được chi nhánh." };

  const branchMap = new Map(
    (branches ?? []).map((b) => [b.id, b.name] as const),
  );

  // Get movements grouped by branch
  let movQuery = supabase
    .from("stock_movements")
    .select("branch_id, type, quantity_change")
    .eq("tenant_id", claims.tenant_id)
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

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
      adjustment: sums.adjustment + sums.count_adjustment,
    });
  }

  rows.sort((a, b) => a.branch_name.localeCompare(b.branch_name, "vi"));

  return { success: true, data: rows };
}

/* ─── fetchInTransitTransfers ─── */

export async function fetchInTransitTransfers(): Promise<
  ActionResult<InTransitTransfer[]>
> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data: transfers, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, status, shipped_at, from_branch_id, to_branch_id",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["confirmed_ship", "in_transit"])
    .order("shipped_at", { ascending: false });

  if (error) return { success: false, error: "Không tải được phiếu chuyển." };
  if (!transfers || transfers.length === 0) {
    return { success: true, data: [] };
  }

  // Get branch names
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id);
  const nameById = new Map(
    (branches ?? []).map((b) => [b.id, b.name] as const),
  );

  // Get item counts per transfer
  const transferIds = transfers.map((t) => t.id);
  const { data: items } = await supabase
    .from("stock_transfer_items")
    .select("transfer_id")
    .eq("tenant_id", claims.tenant_id)
    .in("transfer_id", transferIds);

  const countByTransfer = new Map<number, number>();
  for (const item of items ?? []) {
    countByTransfer.set(
      item.transfer_id,
      (countByTransfer.get(item.transfer_id) ?? 0) + 1,
    );
  }

  const result: InTransitTransfer[] = transfers.map((t) => ({
    id: t.id,
    transfer_number: t.transfer_number,
    status: t.status,
    from_branch_name: nameById.get(t.from_branch_id) ?? "—",
    to_branch_name: nameById.get(t.to_branch_id) ?? "—",
    shipped_at: t.shipped_at,
    item_count: countByTransfer.get(t.id) ?? 0,
  }));

  return { success: true, data: result };
}
