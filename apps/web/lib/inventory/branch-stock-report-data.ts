import "server-only";

import { notFound } from "next/navigation";
import {
  getVNDateString,
  getVNMonthStartDateString,
} from "@comtammatu/shared/time";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import {
  fetchConsumptionVariance,
  fetchStockMovementReport,
} from "@/(protected)/inventory/report-actions";
import {
  getBranchStockMovementHighlights,
  getBranchStockVarianceExceptions,
} from "./branch-stock-report-model";

export async function loadBranchStockReportData(
  routeBranchId: number,
  requestedLocationId: number | null = null,
) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const periodStart = getVNMonthStartDateString();
  const periodEnd = getVNDateString();
  const { data: rawLocations, error: locationsError } = await supabase
    .from("inventory_locations")
    .select("id, name, location_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", routeBranchId)
    .eq("is_active", true)
    .in("location_kind", ["warehouse", "kitchen"])
    .order("sort_order")
    .order("id");
  if (locationsError) throw new Error("inventory.reports.locations_failed");
  const locations = (rawLocations ?? []).map((location) => ({
    id: Number(location.id),
    name: String(location.name),
    kind: String(location.location_kind) as "warehouse" | "kitchen",
  }));
  if (
    requestedLocationId != null &&
    !locations.some((location) => location.id === requestedLocationId)
  ) {
    notFound();
  }
  const { loadWasteAnalyticsData } = await import("./waste-analytics-data");
  const [varianceResult, movementResult, wasteResult] = await Promise.all([
    fetchConsumptionVariance({
      startDate: periodStart,
      endDate: periodEnd,
      branchId: routeBranchId,
    }),
    fetchStockMovementReport({
      startDate: periodStart,
      endDate: periodEnd,
      branchId: routeBranchId,
      locationId: requestedLocationId ?? undefined,
    }),
    loadWasteAnalyticsData({
      branchId: routeBranchId,
      startDate: periodStart,
      endDate: periodEnd,
    }),
  ]);
  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );

  return {
    branchId: routeBranchId,
    branchName: branch ? getBranchSiteDisplayName(branch) : UNKNOWN_LABEL_VI,
    periodStart,
    periodEnd,
    locations,
    selectedLocationId: requestedLocationId,
    varianceLoadFailed: !varianceResult.success,
    movementLoadFailed: !movementResult.success,
    wasteAnalytics: wasteResult.data,
    varianceExceptions:
      varianceResult.success && varianceResult.data
        ? getBranchStockVarianceExceptions(varianceResult.data)
        : [],
    movementHighlights:
      movementResult.success && movementResult.data
        ? getBranchStockMovementHighlights(movementResult.data)
        : [],
  };
}
