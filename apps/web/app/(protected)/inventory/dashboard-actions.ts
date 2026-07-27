"use server";

import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithAnyPermission } from "./_lib/auth";

/* ─── Dashboard summary (S12) ─── */

export type DashboardSummary = {
  totalSkus: number;
  locationCount: number;
  totalQuantity: number;
  totalValueVnd: number | null;
  alertsCount: number;
};

export type DashboardLocation = {
  locationId: number;
  locationName: string;
  locationKind: string;
  skuCount: number;
  totalQuantity: number;
  totalValueVnd: number | null;
  alertsCount: number;
};

export type DashboardAlert = {
  alertType: "negative_stock" | "out_of_stock" | "low_stock";
  severityRank: number;
  ingredientId: number;
  ingredientName: string;
  locationId: number;
  locationName: string;
  currentQuantity: number;
  reorderPoint: number | null;
  shortageRatio: number;
};

export type DashboardInTransit = {
  ingredientId: number;
  ingredientName: string;
  totalQuantity: number;
  transferCount: number;
};

export type InventoryDashboard = {
  branchId: number;
  computedAt: string;
  canViewCost: boolean;
  summary: DashboardSummary;
  locations: DashboardLocation[];
  topAlerts: DashboardAlert[];
  inTransit: DashboardInTransit[];
};

/**
 * Fetch consolidated dashboard JSONB for a branch.
 * Wraps `get_inventory_dashboard` RPC (SECURITY DEFINER, per regression
 * RLS-NOT-APPLIED-ON-MV).
 *
 * Cost fields masked NULL unless caller holds reports:view_branch/tenant.
 */
export async function getInventoryDashboard(
  branchId: number,
): Promise<ActionResult<InventoryDashboard>> {
  const ctx = await getAuthContextWithAnyPermission(STAFF_ROLES, [
    PERMISSION_KEYS.INVENTORY_READ,
    PERMISSION_KEYS.REPORTS_VIEW_BRANCH,
    PERMISSION_KEYS.REPORTS_VIEW_TENANT,
  ]);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_inventory_dashboard", {
    p_branch_id: branchId,
  });

  if (error || !data) {
    return { success: false, error: "Không tải được tổng quan kho" };
  }

  const raw = data as Record<string, unknown>;
  const summary = (raw.summary ?? {}) as Record<string, unknown>;

  return {
    success: true,
    data: {
      branchId: Number(raw.branch_id ?? branchId),
      computedAt: String(raw.computed_at ?? new Date().toISOString()),
      canViewCost: Boolean(raw.can_view_cost),
      summary: {
        totalSkus: Number(summary.total_skus ?? 0),
        locationCount: Number(summary.location_count ?? 0),
        totalQuantity: Number(summary.total_quantity ?? 0),
        totalValueVnd:
          summary.total_value_vnd === null ||
          summary.total_value_vnd === undefined
            ? null
            : Number(summary.total_value_vnd),
        alertsCount: Number(summary.alerts_count ?? 0),
      },
      locations: (Array.isArray(raw.locations) ? raw.locations : []).map(
        (l: Record<string, unknown>) => ({
          locationId: Number(l.location_id ?? 0),
          locationName: String(l.location_name ?? ""),
          locationKind: String(l.location_kind ?? ""),
          skuCount: Number(l.sku_count ?? 0),
          totalQuantity: Number(l.total_quantity ?? 0),
          totalValueVnd:
            l.total_value_vnd === null || l.total_value_vnd === undefined
              ? null
              : Number(l.total_value_vnd),
          alertsCount: Number(l.alerts_count ?? 0),
        }),
      ),
      topAlerts: (Array.isArray(raw.top_alerts) ? raw.top_alerts : []).map(
        (a: Record<string, unknown>) => ({
          alertType: String(
            a.alert_type ?? "low_stock",
          ) as DashboardAlert["alertType"],
          severityRank: Number(a.severity_rank ?? 2),
          ingredientId: Number(a.ingredient_id ?? 0),
          ingredientName: String(a.ingredient_name ?? ""),
          locationId: Number(a.location_id ?? 0),
          locationName: String(a.location_name ?? ""),
          currentQuantity: Number(a.current_quantity ?? 0),
          reorderPoint:
            a.reorder_point === null || a.reorder_point === undefined
              ? null
              : Number(a.reorder_point),
          shortageRatio: Number(a.shortage_ratio ?? 0),
        }),
      ),
      inTransit: (Array.isArray(raw.in_transit) ? raw.in_transit : []).map(
        (t: Record<string, unknown>) => ({
          ingredientId: Number(t.ingredient_id ?? 0),
          ingredientName: String(t.ingredient_name ?? ""),
          totalQuantity: Number(t.total_quantity ?? 0),
          transferCount: Number(t.transfer_count ?? 0),
        }),
      ),
    },
  };
}
