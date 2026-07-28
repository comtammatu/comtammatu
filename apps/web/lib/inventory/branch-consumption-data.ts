import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { fetchStockIssues } from "@/(protected)/inventory/issue-actions";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { getEmbeddedIngredientBaseUnitDisplayName } from "@/(protected)/inventory/_lib/unit-display";
import {
  isBranchStockIssueType,
  toBranchStockIssueStatus,
  type BranchStockIssue,
} from "./stock-issue-model";
import {
  resolveBranchConsumptionSourceKind,
  type BranchConsumptionSourceKind,
  type BranchRecordedConsumption,
} from "./branch-consumption-model";
import { messages } from "@lib/messages";

type ConsumptionIssueRow = {
  id: number;
  issue_number: string | null;
  issue_type: string;
  status: string;
  notes: string | null;
  issued_at: string;
  branch_id: number;
};

type RelatedIssue = {
  issue_number: string | null;
  source_type: string | null;
  source_ref: unknown;
};

type RecordedConsumptionRow = {
  id: number;
  order_id: number | null;
  issue_id: number | null;
  quantity_change: number;
  created_at: string;
  reason: string | null;
  inventory_locations:
    | { name: string | null; code: string | null }
    | Array<{ name: string | null; code: string | null }>
    | null;
  ingredients: Record<string, unknown> | Array<Record<string, unknown>> | null;
  stock_issues: RelatedIssue | RelatedIssue[] | null;
};

export type BranchConsumptionListData = {
  branchId: number;
  branchName: string;
  canManage: boolean;
  manualIssues: BranchStockIssue[];
  manualIssuesLoadFailed: boolean;
  recorded: BranchRecordedConsumption[];
  recordedLoadFailed: boolean;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceLabel(
  kind: BranchConsumptionSourceKind,
  issue: RelatedIssue | null,
  reason: string | null,
): string {
  if (kind === "pos") return "POS";
  if (kind === "hrm") return messages.inventory.issues.hrmConsumptionSource;
  if (kind === "manual") {
    return issue?.issue_number
      ? `${messages.inventory.issues.manualSource} · ${issue.issue_number}`
      : messages.inventory.issues.manualSource;
  }
  if (kind === "import") return "Import matu-platform";
  return reason?.trim() || "—";
}

function mapManualIssue(row: ConsumptionIssueRow): BranchStockIssue | null {
  if (
    row.issue_type !== "consumption" ||
    !isBranchStockIssueType(row.issue_type)
  ) {
    return null;
  }
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

function mapRecordedConsumption(
  row: RecordedConsumptionRow,
): BranchRecordedConsumption {
  const issue = relatedOne(row.stock_issues);
  const location = relatedOne(row.inventory_locations);
  const ingredient = relatedOne(row.ingredients);
  const quantity = Math.abs(toNumber(row.quantity_change));
  const kind = resolveBranchConsumptionSourceKind({
    orderId: row.order_id,
    issueId: row.issue_id,
    issueSourceType: issue?.source_type ?? null,
    reason: row.reason,
  });
  return {
    id: row.id,
    issueId: row.issue_id,
    orderId: row.order_id,
    issueCode: issue?.issue_number ?? null,
    sourceKind: kind,
    sourceLabel: sourceLabel(kind, issue, row.reason),
    recordedAt: row.created_at,
    locationName: location?.name ?? location?.code ?? "—",
    ingredientName: String(ingredient?.name ?? "—"),
    quantity,
    unit: getEmbeddedIngredientBaseUnitDisplayName(ingredient) ?? "",
  };
}

export async function loadBranchConsumptionListData(
  routeBranchId: number,
): Promise<BranchConsumptionListData> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );
  const [issuesResult, recordedResult, canManage] = await Promise.all([
    fetchStockIssues({
      branchId: routeBranchId,
      issueTypes: ["consumption"],
    }),
    supabase
      .from("stock_movements")
      .select(
        "id, order_id, issue_id, quantity_change, created_at, reason, inventory_locations ( name, code ), ingredients ( name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code, name)) ), stock_issues!stock_movements_issue_id_fkey ( issue_number, source_type, source_ref )",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", routeBranchId)
      .eq("type", "consumption")
      .eq("movement_subtype", "sale_consumption")
      .order("created_at", { ascending: false })
      .limit(100),
    currentUserHasPermission(routeBranchId, PERMISSION_KEYS.INVENTORY_WRITE),
  ]);
  const manualRows = issuesResult.success
    ? ((issuesResult.data ?? []) as ConsumptionIssueRow[])
    : [];
  const manualIssues = manualRows
    .map(mapManualIssue)
    .filter((issue): issue is BranchStockIssue => issue !== null);
  const recordedRows = (recordedResult.data ??
    []) as unknown as RecordedConsumptionRow[];

  return {
    branchId: routeBranchId,
    branchName: branch
      ? getBranchSiteDisplayName(branch)
      : `CN #${routeBranchId}`,
    canManage,
    manualIssues,
    manualIssuesLoadFailed: !issuesResult.success,
    recorded: recordedRows.map(mapRecordedConsumption),
    recordedLoadFailed: recordedResult.error != null,
  };
}
