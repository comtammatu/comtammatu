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
import { type BranchRecordedConsumption } from "./branch-consumption-model";
import {
  attachIngredientBaseUnitEmbeds,
  loadIngredientBaseUnitEmbeds,
} from "./load-ingredient-base-unit-embeds";
import {
  groupSaleConsumptionsByOrder,
  RECORDED_SALE_CONSUMPTION_MOVEMENT_FETCH_LIMIT,
  RECORDED_SALE_CONSUMPTION_ORDER_LIMIT,
  type RecordedSaleConsumptionLineInput,
} from "./recorded-sale-consumption-model";

type ConsumptionIssueRow = {
  id: number;
  issue_number: string | null;
  issue_type: string;
  status: string;
  notes: string | null;
  issued_at: string;
  branch_id: number;
};

type OrderRef = {
  id: number;
  order_number: string | null;
};

type RecordedConsumptionRow = {
  id: number;
  order_id: number;
  ingredient_id: number;
  quantity_change: number;
  created_at: string;
  inventory_locations:
    | { name: string | null; code: string | null }
    | Array<{ name: string | null; code: string | null }>
    | null;
  ingredients: Record<string, unknown> | Array<Record<string, unknown>> | null;
  orders: OrderRef | OrderRef[] | null;
};

export type BranchConsumptionListData = {
  branchId: number;
  branchName: string;
  canManage: boolean;
  showRecorded: boolean;
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

function mapRecordedConsumptionOrders(
  rows: RecordedConsumptionRow[],
  branchId: number,
  branchName: string,
): BranchRecordedConsumption[] {
  const lineInputs: RecordedSaleConsumptionLineInput[] = rows.map((row) => {
    const order = relatedOne(row.orders);
    const location = relatedOne(row.inventory_locations);
    const ingredient = relatedOne(row.ingredients);
    const quantity = Math.abs(toNumber(row.quantity_change));
    const unit = getEmbeddedIngredientBaseUnitDisplayName(ingredient) ?? "";
    return {
      id: row.id,
      orderId: row.order_id,
      orderNumber: order?.order_number ?? null,
      branchId,
      branchName,
      recordedAtIso: row.created_at,
      recordedAtLabel: row.created_at,
      locationName: location?.name ?? location?.code ?? "—",
      ingredientName: String(ingredient?.name ?? "—"),
      quantityLabel: unit ? `${quantity} ${unit}` : String(quantity),
      quantityValue: quantity,
      unit,
      unitCostLabel: null,
      totalCostValue: 0,
      totalCostLabel: null,
      sourceLabel: "POS",
    };
  });

  return groupSaleConsumptionsByOrder(lineInputs, {
    orderLimit: RECORDED_SALE_CONSUMPTION_ORDER_LIMIT,
  }).map((order) => ({
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    recordedAt: order.recordedAtIso,
    locationName: order.locationName,
    sourceKind: "pos" as const,
    sourceLabel: order.sourceLabel,
    ingredientCount: order.ingredientCount,
    lines: order.lines.map((line) => ({
      id: line.id,
      ingredientName: line.ingredientName,
      locationName: line.locationName,
      quantity: line.quantityValue,
      unit: line.unit,
    })),
  }));
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
  const branchName = branch
    ? getBranchSiteDisplayName(branch)
    : `CN #${routeBranchId}`;
  const showRecorded = branch?.branch_kind === "branch";
  const recordedQuery = showRecorded
    ? supabase
        .from("stock_movements")
        .select(
          "id, order_id, ingredient_id, quantity_change, created_at, inventory_locations ( name, code ), ingredients ( name ), orders!stock_movements_order_id_fkey ( id, order_number )",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", routeBranchId)
        .eq("type", "consumption")
        .eq("movement_subtype", "sale_consumption")
        .not("order_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(RECORDED_SALE_CONSUMPTION_MOVEMENT_FETCH_LIMIT)
    : null;
  const [issuesResult, recordedResult, canManage] = await Promise.all([
    fetchStockIssues({
      branchId: routeBranchId,
      issueTypes: ["consumption"],
    }),
    recordedQuery,
    currentUserHasPermission(routeBranchId, PERMISSION_KEYS.INVENTORY_WRITE),
  ]);
  const manualRows = issuesResult.success
    ? ((issuesResult.data ?? []) as ConsumptionIssueRow[])
    : [];
  const manualIssues = manualRows
    .map(mapManualIssue)
    .filter((issue): issue is BranchStockIssue => issue !== null);
  const recordedRows = (recordedResult?.data ??
    []) as unknown as RecordedConsumptionRow[];
  attachIngredientBaseUnitEmbeds(
    recordedRows,
    await loadIngredientBaseUnitEmbeds({
      supabase,
      tenantId: claims.tenant_id,
      ingredientIds: recordedRows.map((row) => Number(row.ingredient_id)),
    }),
  );

  return {
    branchId: routeBranchId,
    branchName,
    canManage,
    showRecorded,
    manualIssues,
    manualIssuesLoadFailed: !issuesResult.success,
    recorded: mapRecordedConsumptionOrders(
      recordedRows,
      routeBranchId,
      branchName,
    ),
    recordedLoadFailed: recordedResult?.error != null,
  };
}
