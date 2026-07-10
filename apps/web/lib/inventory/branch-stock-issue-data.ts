import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import {
  resolveInventoryBranchScope,
  resolveInventoryListScope,
} from "@/(protected)/inventory/_lib/inventory-scope";
import type { IngredientRow } from "@/(protected)/inventory/_lib/types";
import {
  fetchStockIssueDetail,
  fetchStockIssues,
} from "@/(protected)/inventory/issue-actions";
import {
  isBranchInternalIssueType,
  isBranchStockIssueType,
  toBranchStockIssueStatus,
  type BranchStockIssue,
  type BranchStockIssueDetail,
  type BranchStockIssueIngredient,
  type BranchStockIssueLine,
  type BranchStockIssuePermissions,
} from "./stock-issue-model";

type StockIssueListRow = {
  id: number;
  issue_number: string | null;
  issue_type: string;
  status: string;
  notes: string | null;
  issued_at: string;
  branch_id: number;
};

type StockIssueDetailRow = {
  issue: {
    id: number;
    issue_number: string | null;
    issue_type: string;
    status: string;
    notes: string | null;
    issued_at: string;
    branch_id: number;
    source_location_id: number | null;
  };
  lines: Array<{
    id: number;
    ingredient_id: number;
    quantity: number | null;
    unit: string | null;
    entry_unit_id: number | null;
    reason: string | null;
    ingredients: { id: number; name: string; unit: string } | null;
  }>;
};

type StockLevelRow = {
  ingredient_id: number;
  current_quantity: number | null;
};

function toBranchStockIssue(row: StockIssueListRow): BranchStockIssue | null {
  if (!isBranchStockIssueType(row.issue_type)) return null;

  return {
    id: row.id,
    code: row.issue_number ?? `PXK-${row.id}`,
    type: row.issue_type,
    status: toBranchStockIssueStatus(row.status),
    issuedAt: row.issued_at,
    notes: row.notes,
    branchId: row.branch_id,
  };
}

function toBranchInternalStockIssue(
  row: StockIssueListRow,
): BranchStockIssue | null {
  if (!isBranchInternalIssueType(row.issue_type)) return null;
  return toBranchStockIssue(row);
}

function toBranchStockIssueLine(
  row: StockIssueDetailRow["lines"][number],
): BranchStockIssueLine {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredients?.name ?? `#${row.ingredient_id}`,
    quantity: Number(row.quantity ?? 0),
    unit: row.unit ?? row.ingredients?.unit ?? "",
    entryUnitId: row.entry_unit_id,
    reason: row.reason,
  };
}

function toBranchStockIssueIngredient(
  ingredient: IngredientRow,
  currentQuantity: number,
): BranchStockIssueIngredient {
  return {
    id: ingredient.id,
    name: ingredient.name,
    sku: ingredient.sku,
    category: ingredient.category,
    isActive: ingredient.is_active,
    currentQuantity,
    units: ingredient.units ?? [],
  };
}

async function loadIssuePermissions(branchId: number) {
  const [canCreateOther, canCreateWriteoff] = await Promise.all([
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITE),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITEOFF),
  ]);

  return {
    canCreateOther,
    canCreateWriteoff,
  } satisfies BranchStockIssuePermissions;
}

export async function loadBranchStockIssueListData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const [issuesResult, permissions] = await Promise.all([
    fetchStockIssues({
      branchId: routeBranchId,
      issueTypes: ["writeoff", "other"],
    }),
    loadIssuePermissions(routeBranchId),
  ]);
  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );
  const issues = issuesResult.success
    ? ((issuesResult.data ?? []) as StockIssueListRow[])
        .map(toBranchInternalStockIssue)
        .filter((issue): issue is BranchStockIssue => issue !== null)
    : [];

  return {
    branchId: routeBranchId,
    branchName: branch
      ? getBranchSiteDisplayName(branch)
      : `CN #${routeBranchId}`,
    issues,
    permissions,
  };
}

export async function loadBranchStockIssueDetailData(
  issueId: number,
  routeBranchId: number,
  expectedType?: BranchStockIssue["type"],
): Promise<BranchStockIssueDetail> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    routeBranchId,
  );
  if (scope.selectedBranchId !== routeBranchId) notFound();

  const [detailResult, ingredientsResult, permissions] = await Promise.all([
    fetchStockIssueDetail(issueId),
    fetchIngredients(),
    loadIssuePermissions(routeBranchId),
  ]);
  if (!detailResult.success || !detailResult.data) notFound();

  const detail = detailResult.data as StockIssueDetailRow;
  if (
    detail.issue.branch_id !== routeBranchId ||
    !isBranchStockIssueType(detail.issue.issue_type) ||
    (expectedType != null && detail.issue.issue_type !== expectedType)
  ) {
    notFound();
  }

  const ingredientRows = ingredientsResult.success
    ? ((ingredientsResult.data ?? []) as IngredientRow[])
    : [];
  const ingredientIds = ingredientRows.map((ingredient) => ingredient.id);
  const stockByIngredient = new Map<number, number>();

  if (detail.issue.source_location_id != null && ingredientIds.length > 0) {
    const { data: stockRows } = await supabase
      .from("stock_levels")
      .select("ingredient_id, current_quantity")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", routeBranchId)
      .eq("location_id", detail.issue.source_location_id)
      .in("ingredient_id", ingredientIds);

    for (const row of (stockRows ?? []) as StockLevelRow[]) {
      stockByIngredient.set(
        row.ingredient_id,
        Number(row.current_quantity ?? 0),
      );
    }
  }

  const issue = toBranchStockIssue(detail.issue);
  if (!issue) notFound();
  const canManage =
    issue.type === "writeoff"
      ? permissions.canCreateWriteoff
      : permissions.canCreateOther;

  return {
    issue,
    lines: detail.lines.map(toBranchStockIssueLine),
    ingredients: ingredientRows.map((ingredient) =>
      toBranchStockIssueIngredient(
        ingredient,
        stockByIngredient.get(ingredient.id) ?? 0,
      ),
    ),
    canManage,
  };
}
