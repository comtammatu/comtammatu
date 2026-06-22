import { loadAuthState } from "@/_lib/auth";
import { fetchStockIssues } from "../issue-actions";
import {
  formatDate,
  formatDateTime,
  formatQty,
  formatVND,
} from "../_lib/format";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
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

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = await resolveRequestedBranchId(params.branchId);
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const branchFilter = scope.selectedBranchId ?? undefined;

  let recordedConsumptionQuery = supabase
    .from("stock_movements")
    .select(
      "id, branch_id, location_id, ingredient_id, quantity_change, unit_cost, created_at, branches ( name, branch_kind ), inventory_locations ( name, code, location_kind ), ingredients ( name, unit )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("type", "consumption")
    .eq("movement_subtype", "sale_consumption")
    .order("created_at", { ascending: false })
    .limit(50);

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

  const [res, recordedConsumptionRes] = await Promise.all([
    fetchStockIssues(
      branchFilter != null ? { branchId: branchFilter } : undefined,
    ),
    recordedConsumptionQuery,
  ]);
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];
  const recordedConsumptionRows = (recordedConsumptionRes.data ?? []) as Array<
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
      const unitCost = toNumber(row.unit_cost);
      const unit = (ingredient?.unit as string | null) ?? "";

      return {
        id: row.id as number,
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
        unitCost: formatUnitCost(unitCost, unit),
        totalCost: formatVND(quantity * unitCost),
      };
    });

  return (
    <IssuesClient
      issues={issues}
      recordedConsumptions={recordedConsumptions}
      branches={branches}
      defaultBranchId={scope.selectedBranchId ?? branches[0]?.id ?? null}
    />
  );
}
