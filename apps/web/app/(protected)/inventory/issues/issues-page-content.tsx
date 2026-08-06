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

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUnitCost(unitCost: number, unit: string): string {
  if (unitCost <= 0) return "—";
  return unit ? `${formatVND(unitCost)}/${unit}` : formatVND(unitCost);
}

function movementSourceLabel(reason: unknown): string {
  const rawReason = String(reason ?? "");
  const transferCode = rawReason.match(/:(TRF[\w-]+)/)?.[1];

  if (rawReason.startsWith("matu-platform import:")) {
    return transferCode
      ? `Đồng bộ từ matu-platform · ${transferCode}`
      : "Đồng bộ từ matu-platform";
  }
  if (/tiêu hao|tieu hao/i.test(rawReason)) return "Báo cáo tiêu hao";
  if (rawReason) return rawReason;
  return "—";
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
    branchId?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
  listBasePath?: InventoryRouteKey;
  detailBasePath?: string;
  scope?: IssuesScope;
  embedded?: boolean;
}

export async function IssuesPageContent({
  searchParams,
  listBasePath = "/inventory/consumption",
  detailBasePath = listBasePath,
  scope: scopeVariant = "consumption",
  embedded = false,
}: IssuesPageContentProps) {
  const scopeConfig = SCOPE_CONFIG[scopeVariant];
  const params = searchParams ? await searchParams : {};
  const startDate = parseBusinessDateParam(params.startDate);
  const endDate = parseBusinessDateParam(params.endDate);
  const hasRecordedDateFilter = startDate != null || endDate != null;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranchId: params.branchId,
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
                "id, branch_id, location_id, ingredient_id, order_id, quantity_change, unit_cost, created_at, reason, branches ( name, branch_kind ), inventory_locations ( name, code, location_kind ), ingredients ( name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code, name)) )",
              )
          : movementReadClient
              .from("stock_movements")
              .select(
                "id, branch_id, location_id, ingredient_id, order_id, quantity_change, created_at, reason, branches ( name, branch_kind ), inventory_locations ( name, code, location_kind ), ingredients ( name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code, name)) )",
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
      recordedConsumptionQuery = recordedConsumptionQuery.limit(50);
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
  const recordedConsumptions: RecordedConsumptionRow[] =
    recordedConsumptionRows.map((row) => {
      const branch = row.branches as Record<string, unknown> | null;
      const location = row.inventory_locations as Record<
        string,
        unknown
      > | null;
      const ingredient = row.ingredients as Record<string, unknown> | null;
      const quantity = Math.abs(toNumber(row.quantity_change));
      const unitCost =
        monetary.valuation && "unit_cost" in row
          ? toNumber(row.unit_cost)
          : 0;
      const unit = getEmbeddedIngredientBaseUnitDisplayName(ingredient) ?? "";

      return {
        id: row.id as number,
        branchId: row.branch_id as number,
        recordedAt: row.created_at
          ? formatDateTime(row.created_at as string)
          : "—",
        branchName: (branch?.name as string) ?? "—",
        locationName:
          (location?.name as string | null) ??
          (location?.code as string | null) ??
          "—",
        ingredientName: (ingredient?.name as string) ?? "—",
        quantity: unit ? `${formatQty(quantity)} ${unit}` : formatQty(quantity),
        sourceLabel: movementSourceLabel(row.reason),
        monetary: monetary.valuation
          ? {
              unitCost: formatUnitCost(unitCost, unit),
              totalCost: formatVND(quantity * unitCost),
              totalCostValue: quantity * unitCost,
            }
          : null,
      };
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
      defaultBranchId={scope.selectedBranchId ?? branches[0]?.id ?? null}
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
      embedded={embedded}
    />
  );
}
