import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchStockIssues } from "../issue-actions";
import {
  formatDate,
  formatDateTime,
  formatQty,
  formatVND,
} from "@lib/inventory/format";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { tRoute, type InventoryRouteKey } from "../_lib/dictionary";
import { getEmbeddedIngredientBaseUnitDisplayName } from "../_lib/unit-display";
import { IssuesClient } from "./issues-client";
import type {
  IssueBranchOption,
  IssueRow,
  RecordedConsumptionRow,
} from "./issues-client";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import {
  groupSaleConsumptionsByOrder,
  RECORDED_SALE_CONSUMPTION_MOVEMENT_FETCH_LIMIT,
  RECORDED_SALE_CONSUMPTION_ORDER_LIMIT,
  type RecordedSaleConsumptionLineInput,
} from "@lib/inventory/recorded-sale-consumption-model";
import { INVENTORY_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import {
  attachIngredientBaseUnitEmbeds,
  loadIngredientBaseUnitEmbeds,
} from "@lib/inventory/load-ingredient-base-unit-embeds";

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUnitCost(unitCost: number, unit: string): string {
  if (unitCost <= 0) return "—";
  return unit ? `${formatVND(unitCost)}/${unit}` : formatVND(unitCost);
}

function getSingleParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseBusinessDateParam(
  value: string | string[] | undefined,
): string | null {
  const raw = getSingleParam(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? "");
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return raw;
}

function vnBusinessDateBoundaryUtc(value: string, offsetDays = 0): string {
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // Inventory date filters are Vietnam business dates; created_at is timestamptz.
  return new Date(
    Date.UTC(year, month - 1, day + offsetDays, -7, 0, 0),
  ).toISOString();
}

// Scope splits the shared stock_issues surface into route variants:
// "hub" (Owner Tiêu hao page: consumption + writeoff tabs),
// "consumption" (consumption-only), "internal" (writeoff-only / Branch-style).
type IssuesScope = "hub" | "consumption" | "internal";

interface ScopeConfig {
  issueTypes: string[] | undefined;
  showRecordedConsumptions: boolean;
  allowedIssueTypes: string[];
  defaultIssueType: string;
  createHref?: string;
}

const SCOPE_CONFIG: Record<IssuesScope, ScopeConfig> = {
  hub: {
    issueTypes: ["consumption", "writeoff"],
    showRecordedConsumptions: true,
    allowedIssueTypes: ["consumption", "writeoff"],
    defaultIssueType: "consumption",
    createHref: "/inventory/waste/new",
  },
  consumption: {
    issueTypes: ["consumption"],
    showRecordedConsumptions: true,
    allowedIssueTypes: ["consumption"],
    defaultIssueType: "consumption",
  },
  internal: {
    issueTypes: ["writeoff"],
    showRecordedConsumptions: false,
    allowedIssueTypes: ["writeoff"],
    defaultIssueType: "writeoff",
    createHref: "/inventory/waste/new",
  },
};

interface IssuesPageContentProps {
  searchParams?: Promise<{
    branch?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
  listBasePath?: InventoryRouteKey;
  detailBasePath?: string;
  scope?: IssuesScope;
}

export async function IssuesPageContent({
  searchParams,
  listBasePath = "/inventory/consumption",
  detailBasePath = listBasePath,
  scope: scopeVariant = "consumption",
}: IssuesPageContentProps) {
  const scopeConfig = SCOPE_CONFIG[scopeVariant];
  const params = searchParams ? await searchParams : {};
  const startDate = parseBusinessDateParam(params.startDate);
  const endDate = parseBusinessDateParam(params.endDate);
  const hasRecordedDateFilter = startDate != null || endDate != null;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranch: params.branch,
  });
  if (scope.outOfScope) notFound();
  const branchFilter = scope.selectedBranchId ?? undefined;
  const operationalBranchIds = scope.allowedBranches
    .filter((branch) => branch.branch_kind === "branch")
    .map((branch) => branch.id);
  const requestedRecordedBranchId = branchFilter ?? claims.branch_id ?? null;
  const showRecordedConsumptions =
    scopeConfig.showRecordedConsumptions &&
    operationalBranchIds.length > 0 &&
    (requestedRecordedBranchId == null ||
      operationalBranchIds.includes(requestedRecordedBranchId));
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const movementReadClient = monetary.valuation
    ? (monetary.client ?? supabase)
    : supabase;

  // Internal-issue scope hides the sale_consumption ledger entirely; skip the
  // query so the client renders no recordedConsumptions section. Other scopes
  // fetch it in parallel with the stock-issue list.
  let recordedConsumptionQuery = showRecordedConsumptions
    ? (
        monetary.valuation
          ? movementReadClient
              .from("stock_movements")
              .select(
                "id, branch_id, location_id, ingredient_id, order_id, quantity_change, unit_cost, created_at, reason, branches ( name, branch_kind ), inventory_locations ( name, code, location_kind ), ingredients ( name ), orders!stock_movements_order_id_fkey ( id, order_number )",
              )
          : movementReadClient
              .from("stock_movements")
              .select(
                "id, branch_id, location_id, ingredient_id, order_id, quantity_change, created_at, reason, branches ( name, branch_kind ), inventory_locations ( name, code, location_kind ), ingredients ( name ), orders!stock_movements_order_id_fkey ( id, order_number )",
              )
      )
        .eq("tenant_id", claims.tenant_id)
        .eq("type", "consumption")
        .eq("movement_subtype", "sale_consumption")
        .not("order_id", "is", null)
        .order("created_at", { ascending: false })
    : null;

  if (recordedConsumptionQuery) {
    if (requestedRecordedBranchId != null) {
      recordedConsumptionQuery = recordedConsumptionQuery.eq(
        "branch_id",
        requestedRecordedBranchId,
      );
    } else {
      recordedConsumptionQuery = recordedConsumptionQuery.in(
        "branch_id",
        operationalBranchIds,
      );
    }
    if (startDate) {
      recordedConsumptionQuery = recordedConsumptionQuery.gte(
        "created_at",
        vnBusinessDateBoundaryUtc(startDate),
      );
    }
    if (endDate) {
      recordedConsumptionQuery = recordedConsumptionQuery.lt(
        "created_at",
        vnBusinessDateBoundaryUtc(endDate, 1),
      );
    }
    if (!hasRecordedDateFilter) {
      recordedConsumptionQuery = recordedConsumptionQuery.limit(
        RECORDED_SALE_CONSUMPTION_MOVEMENT_FETCH_LIMIT,
      );
    }
  }

  const [res, recordedConsumptionRes] = await Promise.all([
    fetchStockIssues({
      ...(branchFilter != null ? { branchId: branchFilter } : {}),
      ...(scopeConfig.issueTypes ? { issueTypes: scopeConfig.issueTypes } : {}),
    }),
    recordedConsumptionQuery,
  ]);
  if (!res.success || recordedConsumptionRes?.error) {
    throw new Error("inventory.issues.load_failed");
  }

  const dbRows = res.data as Array<Record<string, unknown>>;
  const recordedConsumptionRows = (recordedConsumptionRes?.data ?? []) as Array<
    Record<string, unknown>
  >;
  attachIngredientBaseUnitEmbeds(
    recordedConsumptionRows,
    await loadIngredientBaseUnitEmbeds({
      supabase,
      tenantId: claims.tenant_id,
      ingredientIds: recordedConsumptionRows.map((row) =>
        Number(row.ingredient_id),
      ),
    }),
  );
  const branches: IssueBranchOption[] = scope.allowedBranches.map((b) => ({
    id: b.id,
    name: b.name,
    branchKind: b.branch_kind,
  }));

  const issues: IssueRow[] = dbRows.map((row) => {
    const branches = row.branches as Record<string, unknown> | null;
    return {
      id: row.id as number,
      code: (row.issue_number as string) ?? "",
      type: (row.issue_type as string) ?? "consumption",
      branchName: (branches?.name as string) ?? "—",
      branchKind: (branches?.branch_kind as string | null) ?? null,
      date: row.issued_at ? formatDate(row.issued_at as string) : "—",
      createdBy: "—",
      status: (row.status as string) ?? "draft",
    };
  });
  const recordedConsumptionLineInputs: RecordedSaleConsumptionLineInput[] =
    recordedConsumptionRows.map((row) => {
      const branch = relatedOne(
        row.branches as Record<string, unknown> | Record<string, unknown>[] | null,
      );
      const order = relatedOne(
        row.orders as
          | { id: number; order_number: string | null }
          | Array<{ id: number; order_number: string | null }>
          | null,
      );
      const location = relatedOne(
        row.inventory_locations as Record<string, unknown> | Record<string, unknown>[] | null,
      );
      const ingredient = relatedOne(
        row.ingredients as Record<string, unknown> | Record<string, unknown>[] | null,
      );
      const quantity = Math.abs(toNumber(row.quantity_change));
      const unitCost =
        monetary.valuation && "unit_cost" in row
          ? toNumber(row.unit_cost)
          : 0;
      const unit = getEmbeddedIngredientBaseUnitDisplayName(ingredient) ?? "";
      const totalCostValue = monetary.valuation ? quantity * unitCost : 0;
      const createdAt = row.created_at as string | null;

      return {
        id: row.id as number,
        orderId: row.order_id as number,
        orderNumber: order?.order_number ?? null,
        branchId: row.branch_id as number,
        branchName: (branch?.name as string) ?? "—",
        recordedAtIso: createdAt ?? "",
        recordedAtLabel: createdAt ? formatDateTime(createdAt) : "—",
        locationName:
          (location?.name as string | null) ??
          (location?.code as string | null) ??
          "—",
        ingredientName: (ingredient?.name as string) ?? "—",
        quantityLabel: unit
          ? `${formatQty(quantity)} ${unit}`
          : formatQty(quantity),
        quantityValue: quantity,
        unit,
        unitCostLabel: monetary.valuation
          ? formatUnitCost(unitCost, unit)
          : null,
        totalCostValue,
        totalCostLabel: monetary.valuation ? formatVND(totalCostValue) : null,
        sourceLabel: INVENTORY_STATUS_LABELS_VI.sale_consumption,
      };
    });
  const recordedConsumptions: RecordedConsumptionRow[] =
    groupSaleConsumptionsByOrder(recordedConsumptionLineInputs, {
      orderLimit: hasRecordedDateFilter
        ? null
        : RECORDED_SALE_CONSUMPTION_ORDER_LIMIT,
      formatTotalCost: monetary.valuation ? formatVND : undefined,
    });

  // Desktop route variants derive heading from the route dictionary.
  const pageTitle = tRoute(listBasePath);

  return (
    <IssuesClient
      issues={issues}
      recordedConsumptions={recordedConsumptions}
      showRecordedConsumptions={showRecordedConsumptions}
      canViewMonetary={monetary.valuation}
      branches={branches}
      defaultBranchId={
        scope.scopeMode === "all"
          ? null
          : (scope.selectedBranchId ?? scope.defaultBranchId)
      }
      writeRequiresSitePick={scope.scopeMode === "all"}
      recordedBranchId={requestedRecordedBranchId}
      recordedEndDate={endDate ?? ""}
      recordedIsLimited={!hasRecordedDateFilter}
      recordedStartDate={startDate ?? ""}
      listBasePath={listBasePath}
      detailBasePath={detailBasePath}
      allowedIssueTypes={scopeConfig.allowedIssueTypes}
      defaultIssueType={scopeConfig.defaultIssueType}
      {...(scopeConfig.createHref
        ? { createHref: scopeConfig.createHref }
        : {})}
      pageTitle={pageTitle}
    />
  );
}
