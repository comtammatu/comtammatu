"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import {
  addVNDateDays,
  diffVNDateDays,
  getVNDateString,
} from "@comtammatu/shared/time";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import { getAuthContext } from "./_lib/auth";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

/* ─── Inventory alerts (low-stock / expiry / reorder) ─── */

export async function fetchExpiryAlerts(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let query = supabase
    .from("grn_items")
    .select(
      `
      batch_number,
      expiry_date,
      goods_received_notes!inner (
        branch_id,
        grn_number,
        status,
        branches ( name, branch_kind )
      ),
      ingredients ( id, name )
    `,
    )
    .eq("goods_received_notes.status", "confirmed")
    .not("expiry_date", "is", null)
    .lte("expiry_date", addVNDateDays(getVNDateString(), 7))
    .eq("tenant_id", claims.tenant_id)
    .order("expiry_date", { ascending: true });

  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    query = query.eq("goods_received_notes.branch_id", claims.branch_id);
  } else if (branchId) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải cảnh báo hạn sử dụng." };
  }

  const today = getVNDateString();

  const alerts = (data ?? [])
    .filter((item) => {
      // Skip items where ingredient join failed — write-off requires valid ingredient_id
      const ing = item.ingredients as unknown as { id: number } | null;
      return ing != null && ing.id > 0;
    })
    .map((item) => {
      const daysRemaining = diffVNDateDays(today, item.expiry_date as string);

      const grn = item.goods_received_notes as unknown as {
        grn_number: string;
        branch_id: number;
        branches: {
          name: string;
          branch_kind?: string | null;
        } | null;
      };

      let urgency: "expired" | "critical" | "warning";
      if (daysRemaining <= 0) {
        urgency = "expired";
      } else if (daysRemaining <= 3) {
        urgency = "critical";
      } else {
        urgency = "warning";
      }

      const ingredient = item.ingredients as unknown as {
        id: number;
        name: string;
      };

      return {
        ingredient_id: ingredient.id,
        ingredient_name: ingredient.name,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        grn_number: grn.grn_number,
        branch_id: grn.branch_id,
        branch_name: grn.branches ? getBranchSiteDisplayName(grn.branches) : "",
        days_remaining: daysRemaining,
        urgency,
      };
    });

  return { success: true, data: alerts };
}

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
        id, name, unit, purchase_unit, reorder_point, max_stock_level, is_active
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
        unit: string;
        purchase_unit: string | null;
        reorder_point: number;
        max_stock_level: number | null;
      };
      const maxStock = ing.max_stock_level ?? 0;
      const suggestedQty = Math.max(0, maxStock - sl.current_quantity);

      return {
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        unit: ing.purchase_unit || ing.unit,
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

