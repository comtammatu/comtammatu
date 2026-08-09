"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";
import { suggestedOrderQtyBase } from "@lib/inventory/suggested-order-qty";
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
        id, name, min_stock_level, is_active,
        ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code))
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("ingredients.is_active", true)
    .gt("ingredients.min_stock_level", 0);

  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    query = query.eq("branch_id", claims.branch_id);
  } else if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      "[inventory/alert-actions:fetchReorderAlerts] Fetch reorder alerts error:",
      error,
    );
    return {
      success: false,
      error: messages.inventory.dashboard.reorderAlertsLoadFailed,
    };
  }

  const alerts = (data ?? [])
    .filter((sl) => {
      const ing = sl.ingredients as unknown as {
        min_stock_level: number | null;
      } | null;
      if (!ing || ing.min_stock_level == null) return false;
      return sl.current_quantity <= ing.min_stock_level;
    })
    .map((sl) => {
      const ing = sl.ingredients as unknown as {
        id: number;
        name: string;
        ingredient_units?: {
          is_base: boolean;
          units: { code: string } | null;
        }[];
        min_stock_level: number;
      };
      const suggestedQty = suggestedOrderQtyBase(
        ing.min_stock_level,
        sl.current_quantity,
      );

      return {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.ingredient_units?.find((u) => u.is_base)?.units?.code ?? "",
        current_quantity: sl.current_quantity,
        reorder_point: ing.min_stock_level,
        max_stock_level: null,
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
