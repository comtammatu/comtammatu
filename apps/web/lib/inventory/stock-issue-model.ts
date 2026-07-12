import type { IngredientUnitRow } from "@/(protected)/inventory/_lib/types";

export type BranchInternalIssueType = "writeoff" | "other";
export type BranchStockIssueType = BranchInternalIssueType | "consumption";
export type BranchStockIssueStatus = "draft" | "confirmed" | "cancelled";
export type BranchStockIssueStatusFilter = "all" | BranchStockIssueStatus;

export type BranchStockIssue = {
  id: number;
  code: string;
  type: BranchStockIssueType;
  status: BranchStockIssueStatus;
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
  canCreateOther: boolean;
};

export type BranchStockIssueDetail = {
  issue: BranchStockIssue;
  lines: BranchStockIssueLine[];
  ingredients: BranchStockIssueIngredient[];
  canManage: boolean;
};

export function isBranchStockIssueType(
  value: string,
): value is BranchStockIssueType {
  return value === "writeoff" || value === "other" || value === "consumption";
}

export function isBranchInternalIssueType(
  value: string,
): value is BranchInternalIssueType {
  return value === "writeoff" || value === "other";
}

export function toBranchStockIssueStatus(
  value: string,
): BranchStockIssueStatus {
  if (value === "confirmed" || value === "cancelled") return value;
  return "draft";
}

export function getBranchStockIssueCreateTypes(
  permissions: BranchStockIssuePermissions,
): BranchInternalIssueType[] {
  return permissions.canCreateOther ? ["other"] : [];
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
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");

  return issues.filter((issue) => {
    if (status !== "all" && issue.status !== status) return false;
    if (!normalizedQuery) return true;

    return [issue.code, issue.type, issue.notes ?? ""].some((value) =>
      value.toLocaleLowerCase("vi").includes(normalizedQuery),
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
    issue.type !== "writeoff" &&
    issue.status === "draft" &&
    lines.length > 0 &&
    lines.every((line) => (line.reason ?? "").trim().length > 0)
  );
}
