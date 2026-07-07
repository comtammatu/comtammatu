"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { getAuthContext } from "./_lib/auth";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

/* ─── Inventory alerts (low-stock / reorder) ─── */

/* ─── fetchReorderAlerts ─── */

export async function fetchReorderAlerts(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("stock_levels")
    .select(
      `
      current_quantity,
      branch_id,
      branches ( name, branch_kind ),
      ingredients!inner (
        id, name, reorder_point, max_stock_level, is_active,
        ingredient_units(is_base, units!ingredient_units_unit_id_fkey(code))
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("ingredients.is_active", true)
    .not("ingredients.reorder_point", "is", null);

  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    query = query.eq("branch_id", claims.branch_id);
  } else if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[inventory/alert-actions:fetchReorderAlerts] Fetch reorder alerts error:", error);
    return { success: false, error: "Không thể tải cảnh báo đặt hàng." };
  }

  const alerts = (data ?? [])
    .filter((sl) => {
      const ing = sl.ingredients as unknown as {
        reorder_point: number | null;
      } | null;
      if (!ing || ing.reorder_point == null) return false;
      return sl.current_quantity <= ing.reorder_point;
    })
    .map((sl) => {
      const ing = sl.ingredients as unknown as {
        id: number;
        name: string;
        ingredient_units?: { is_base: boolean; units: { code: string } | null }[];
        reorder_point: number;
        max_stock_level: number | null;
      };
      const maxStock = ing.max_stock_level ?? 0;
      const suggestedQty = Math.max(0, maxStock - sl.current_quantity);

      return {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.ingredient_units?.find((u) => u.is_base)?.units?.code ?? "",
        current_quantity: sl.current_quantity,
        reorder_point: ing.reorder_point,
        max_stock_level: ing.max_stock_level,
        suggested_order_qty: suggestedQty,
        branch_id: sl.branch_id,
        branch_name: sl.branches
          ? getBranchSiteDisplayName(
              sl.branches as unknown as {
                name: string;
                branch_kind?: string | null;
              },
            )
          : "",
      };
    })
    .sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

  return { success: true, data: alerts };
}
