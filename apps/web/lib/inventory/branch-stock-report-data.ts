import "server-only";

import { notFound } from "next/navigation";
import {
  getVNDateString,
  getVNMonthStartDateString,
} from "@comtammatu/shared/time";
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

export async function loadBranchStockReportData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const periodStart = getVNMonthStartDateString();
  const periodEnd = getVNDateString();
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
    branchName: branch
      ? getBranchSiteDisplayName(branch)
      : `CN #${routeBranchId}`,
    periodStart,
    periodEnd,
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
