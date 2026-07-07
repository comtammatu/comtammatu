import { notFound, redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchStockIssues } from "../issue-actions";
import {
  formatDate,
  formatDateTime,
  formatQty,
  formatVND,
} from "../_lib/format";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { tRoute } from "../_lib/dictionary";
import { getEmbeddedIngredientBaseUnitDisplayName } from "../_lib/unit-display";
import { IssuesClient } from "./issues-client";
import type {
  IssueBranchOption,
  IssueRow,
  RecordedConsumptionRow,
} from "./issues-client";

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
      ? `Import matu-platform · ${transferCode}`
      : "Import matu-platform";
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

// Scope splits the shared stock_issues surface into two route variants:
// "consumption" (Tiêu hao) and "internal" (Xuất kho nội bộ). "all" keeps the
// prior full-list behavior so callers that omit scope (operator branch shell)
// are unaffected.
type IssuesScope = "all" | "consumption" | "internal";

interface ScopeConfig {
  issueTypes: string[] | undefined;
  showRecordedConsumptions: boolean;
  allowedIssueTypes: string[];
  defaultIssueType: string;
}

const SCOPE_CONFIG: Record<IssuesScope, ScopeConfig> = {
  all: {
    issueTypes: undefined,
    showRecordedConsumptions: true,
    allowedIssueTypes: ["consumption", "writeoff", "other"],
    defaultIssueType: "consumption",
  },
  consumption: {
    issueTypes: ["consumption"],
    showRecordedConsumptions: true,
    allowedIssueTypes: ["consumption"],
    defaultIssueType: "consumption",
  },
  internal: {
    issueTypes: ["writeoff", "other"],
    showRecordedConsumptions: false,
    allowedIssueTypes: ["writeoff", "other"],
    defaultIssueType: "writeoff",
  },
};

interface IssuesPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
  routeBranchId?: number;
  listBasePath?: string;
  scope?: IssuesScope;
  embedded?: boolean;
}

export async function IssuesPageContent({
  searchParams,
  routeBranchId,
  listBasePath = "/inventory/consumption",
  scope: scopeVariant = "all",
  embedded = false,
}: IssuesPageContentProps) {
  const scopeConfig = SCOPE_CONFIG[scopeVariant];
  const params = searchParams ? await searchParams : {};
  const startDate = parseBusinessDateParam(params.startDate);
  const endDate = parseBusinessDateParam(params.endDate);
  const hasRecordedDateFilter = startDate != null || endDate != null;
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  const branchFilter = scope.selectedBranchId ?? undefined;

  // Internal-issue scope hides the sale_consumption ledger entirely; skip the
  // query so the client renders no recordedConsumptions section. Other scopes
  // fetch it in parallel with the stock-issue list.
  let recordedConsumptionQuery = scopeConfig.showRecordedConsumptions
    ? supabase
        .from("stock_movements")
        .select(
          "id, branch_id, location_id, ingredient_id, quantity_change, unit_cost, created_at, reason, branches ( name, branch_kind ), inventory_locations ( name, code, location_kind ), ingredients ( name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code, name)) )",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("type", "consumption")
        .eq("movement_subtype", "sale_consumption")
        .order("created_at", { ascending: false })
    : null;

  if (recordedConsumptionQuery) {
    if (branchFilter != null) {
      recordedConsumptionQuery = recordedConsumptionQuery.eq(
        "branch_id",
        branchFilter,
      );
    } else if (claims.branch_id) {
      recordedConsumptionQuery = recordedConsumptionQuery.eq(
        "branch_id",
        claims.branch_id,
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
      ...(scopeConfig.issueTypes
        ? { issueTypes: scopeConfig.issueTypes }
        : {}),
    }),
    recordedConsumptionQuery,
  ]);

  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];
  const recordedConsumptionRows = (recordedConsumptionRes?.data ?? []) as Array<
    Record<string, unknown>
  >;
  const scopedBranchOptions =
    routeBranchId != null
      ? scope.allowedBranches.filter((branch) => branch.id === routeBranchId)
      : scope.allowedBranches;
  const branches: IssueBranchOption[] = scopedBranchOptions.map((b) => ({
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
      const unitCost = toNumber(row.unit_cost);
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
        unitCost: formatUnitCost(unitCost, unit),
        totalCost: formatVND(quantity * unitCost),
        totalCostValue: quantity * unitCost,
      };
    });

  // Desktop route variants derive their heading/section title from the route
  // dictionary so each variant shows its own label; "all" (operator shell)
  // leaves it undefined so the client keeps its Tiêu hao default.
  const pageTitle =
    scopeVariant === "all" ? undefined : tRoute(listBasePath);

  return (
    <IssuesClient
      issues={issues}
      recordedConsumptions={recordedConsumptions}
      branches={branches}
      defaultBranchId={scope.selectedBranchId ?? branches[0]?.id ?? null}
      recordedBranchId={branchFilter ?? claims.branch_id ?? null}
      recordedEndDate={endDate ?? ""}
      recordedIsLimited={!hasRecordedDateFilter}
      recordedStartDate={startDate ?? ""}
      listBasePath={listBasePath}
      allowedIssueTypes={scopeConfig.allowedIssueTypes}
      defaultIssueType={scopeConfig.defaultIssueType}
      pageTitle={pageTitle}
      embedded={embedded}
    />
  );
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const qParams = new URLSearchParams();
  qParams.set("tab", "issues");
  if (params.branchId) {
    if (Array.isArray(params.branchId)) {
      params.branchId.forEach((id) => qParams.append("branchId", id));
    } else {
      qParams.set("branchId", params.branchId);
    }
  }
  // forward date parameters if they exist
  if (params.startDate) {
    const sd = Array.isArray(params.startDate) ? params.startDate[0] : params.startDate;
    if (sd) qParams.set("startDate", sd);
  }
  if (params.endDate) {
    const ed = Array.isArray(params.endDate) ? params.endDate[0] : params.endDate;
    if (ed) qParams.set("endDate", ed);
  }
  redirect(`/inventory/operations?${qParams.toString()}`);
}
