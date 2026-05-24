"use server";

import { fetchInventoryValueByBranch as fetchInventoryValueByBranchAction } from "../(protected)/inventory/inventory-value-actions";
import {
  fetchBranchMovementSummary as fetchBranchMovementSummaryAction,
  fetchStockMovementReport as fetchStockMovementReportAction,
} from "../(protected)/inventory/report-actions";
export type {
  BranchMovementSummaryRow,
  MovementReportRow,
} from "../(protected)/inventory/report-actions";

export async function fetchInventoryValueByBranch() {
  return fetchInventoryValueByBranchAction();
}

export async function fetchStockMovementReport(
  input: Parameters<typeof fetchStockMovementReportAction>[0],
) {
  return fetchStockMovementReportAction(input);
}

export async function fetchBranchMovementSummary(
  input: Parameters<typeof fetchBranchMovementSummaryAction>[0],
) {
  return fetchBranchMovementSummaryAction(input);
}
