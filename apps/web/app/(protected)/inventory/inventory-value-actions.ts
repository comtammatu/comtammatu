"use server";

import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

const SYSTEM_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

const BRANCH_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
];

function computeLineValue(
  qty: number,
  avgUnitCost: number | null | undefined,
  ingredientUnitCost: number | null | undefined,
): number {
  const unit =
    avgUnitCost != null
      ? Number(avgUnitCost)
      : ingredientUnitCost != null
        ? Number(ingredientUnitCost)
        : 0;
  return Number(qty) * unit;
}

type IngredientCost = { unit_cost: number | null } | null;

export async function fetchInventoryValueSystem(
  branchId?: number,
): Promise<ActionResult<{ totalValue: number }>> {
  const ctx = await getAuthContextWithPermission(
    SYSTEM_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("stock_levels")
    .select(
      `
      current_quantity,
      avg_unit_cost,
      ingredients ( unit_cost )
    `,
    )
    .eq("tenant_id", claims.tenant_id);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tính giá trị tồn kho." };
  }

  let totalValue = 0;
  for (const row of data ?? []) {
    const ing = row.ingredients as IngredientCost;
    totalValue += computeLineValue(
      Number(row.current_quantity),
      row.avg_unit_cost != null ? Number(row.avg_unit_cost) : null,
      ing?.unit_cost != null ? Number(ing.unit_cost) : null,
    );
  }

  return { success: true, data: { totalValue } };
}

export interface BranchValueRow {
  branchId: number;
  branchName: string;
  totalValue: number;
}

export async function fetchInventoryValueByBranch(): Promise<
  ActionResult<{ rows: BranchValueRow[] }>
> {
  const ctx = await getAuthContextWithPermission(
    BRANCH_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let allowedBranchIds: number[] | null = null;

  if (claims.user_role === "branch_manager") {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa gắn chi nhánh.",
      };
    }
    allowedBranchIds = [claims.branch_id];
  }

  let branchesQuery = supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  if (allowedBranchIds) {
    branchesQuery = branchesQuery.in("id", allowedBranchIds);
  }

  const { data: branchList, error: brError } = await branchesQuery;

  if (brError) {
    return { success: false, error: "Không thể tải danh sách chi nhánh." };
  }

  const branchIds = (branchList ?? []).map((b) => b.id);
  if (branchIds.length === 0) {
    return { success: true, data: { rows: [] } };
  }

  const { data: stockRows, error: stockError } = await supabase
    .from("stock_levels")
    .select(
      `
      branch_id,
      current_quantity,
      avg_unit_cost,
      ingredients ( unit_cost )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .in("branch_id", branchIds);

  if (stockError) {
    return { success: false, error: "Không thể tải tồn kho." };
  }

  const totals = new Map<number, number>();
  for (const b of branchIds) {
    totals.set(b, 0);
  }

  for (const row of stockRows ?? []) {
    const bid = row.branch_id;
    const line = computeLineValue(
      Number(row.current_quantity),
      row.avg_unit_cost != null ? Number(row.avg_unit_cost) : null,
      (row.ingredients as IngredientCost)?.unit_cost != null
        ? Number((row.ingredients as IngredientCost)?.unit_cost)
        : null,
    );
    totals.set(bid, (totals.get(bid) ?? 0) + line);
  }

  const rows: BranchValueRow[] = (branchList ?? []).map((b) => ({
    branchId: b.id,
    branchName: getBranchSiteDisplayName(b),
    totalValue: totals.get(b.id) ?? 0,
  }));

  return { success: true, data: { rows } };
}
