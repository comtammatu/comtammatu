import { matchesSearch } from "@lib/search";
import type { IngredientUnitRow } from "@lib/inventory/types";

export type BranchInternalIssueType = "writeoff";
export type BranchStockIssueType = BranchInternalIssueType | "consumption";
export type BranchStockIssueStatus = "draft" | "confirmed" | "cancelled";
export type BranchStockIssueStatusFilter = "all" | BranchStockIssueStatus;

export type BranchStockIssue = {
  id: number;
  code: string;
  type: BranchStockIssueType;
  status: BranchStockIssueStatus;
  approvalStatus: string;
  issuedAt: string;
  notes: string | null;
  branchId: number;
};

export type BranchStockIssueLine = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  entryUnitId: number | null;
  reason: string | null;
  photoUrls: string[];
};

export type BranchStockIssueIngredient = {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  isActive: boolean;
  currentQuantity: number;
  units: IngredientUnitRow[];
};

export type BranchStockIssuePermissions = {
  canCreateWriteoff: boolean;
};

export type BranchStockIssueDetail = {
  tenantId: number;
  issue: BranchStockIssue;
  lines: BranchStockIssueLine[];
  ingredients: BranchStockIssueIngredient[];
  canManage: boolean;
};

export function isBranchStockIssueType(
  value: string,
): value is BranchStockIssueType {
  return value === "writeoff" || value === "consumption";
}

export function isBranchInternalIssueType(
  value: string,
): value is BranchInternalIssueType {
  return value === "writeoff";
}

export function toBranchStockIssueStatus(
  value: string,
): BranchStockIssueStatus {
  if (value === "confirmed" || value === "cancelled") return value;
  return "draft";
}

export function filterBranchStockIssues(
  issues: BranchStockIssue[],
  {
    query,
    status,
  }: {
    query: string;
    status: BranchStockIssueStatusFilter;
  },
) {
  const normalizedQuery = query.trim();

  return issues.filter((issue) => {
    if (status !== "all" && issue.status !== status) return false;
    if (!normalizedQuery) return true;

    return matchesSearch(
      [issue.code, issue.type, issue.notes ?? ""],
      normalizedQuery,
    );
  });
}

export function canConfirmBranchStockIssue({
  issue,
  lines,
  canManage,
}: Pick<BranchStockIssueDetail, "issue" | "lines" | "canManage">) {
  return (
    canManage &&
    issue.status === "draft" &&
    !(issue.type === "writeoff" && issue.approvalStatus === "pending") &&
    lines.length > 0
  );
}
