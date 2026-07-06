import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { fetchIngredients } from "../../ingredient-actions";
import { fetchStockIssueDetail } from "../../issue-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { IssueDetailClient } from "./issue-detail-client";
import type { IngredientRow } from "../../page";

interface IssueDetailPageContentProps {
  issueId: number;
  routeBranchId?: number;
  listBasePath?: string;
  embedded?: boolean;
}

export async function IssueDetailPageContent({
  issueId,
  routeBranchId,
  listBasePath = "/inventory/consumption",
  embedded = false,
}: IssueDetailPageContentProps) {
  if (!Number.isFinite(issueId) || issueId <= 0) notFound();

  const [res, ingredientsRes, auditLogs] = await Promise.all([
    fetchStockIssueDetail(issueId),
    fetchIngredients(),
    fetchEntityAuditLogs("stock_issue", issueId, 50),
  ]);

  if (!res.success || !res.data) notFound();

  const d = res.data as {
    issue: {
      id: number;
      issue_number: string;
      issue_type: string;
      status: string;
      notes: string | null;
      issued_at: string;
      branch_id: number;
      source_location_id: number | null;
      source_type: string | null;
      source_ref: unknown;
      branches: {
        id: number;
        name: string;
        branch_kind?: string | null;
      } | null;
    };
    lines: Array<{
      id: number;
      ingredient_id: number;
      quantity: number;
      unit: string;
      entry_unit_id: number | null;
      unit_cost: number;
      total_cost: number;
      reason: string | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };
  if (routeBranchId != null && d.issue.branch_id !== routeBranchId) notFound();
  const baseIngredients: IngredientRow[] = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];
  const stockLevelByIngredient = new Map<
    number,
    { current_quantity: number; avg_unit_cost: number | null }
  >();
  if (d.issue.source_location_id && baseIngredients.length > 0) {
    const { supabase, claims } = await loadAuthState();
    const { data: stockLevels } = await supabase
      .from("stock_levels")
      .select("ingredient_id, current_quantity, avg_unit_cost")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", d.issue.branch_id)
      .eq("location_id", d.issue.source_location_id);
    for (const row of stockLevels ?? []) {
      stockLevelByIngredient.set(row.ingredient_id, {
        current_quantity: Number(row.current_quantity ?? 0),
        avg_unit_cost:
          row.avg_unit_cost == null ? null : Number(row.avg_unit_cost),
      });
    }
  }
  const ingredients = baseIngredients.map((ingredient) => {
    const stockLevel = stockLevelByIngredient.get(ingredient.id);
    return {
      ...ingredient,
      current_quantity: stockLevel?.current_quantity ?? 0,
      avg_unit_cost: stockLevel?.avg_unit_cost ?? null,
    };
  });
  const canAdjustStock = await currentUserHasPermission(
    d.issue.branch_id,
    PERMISSION_KEYS.INVENTORY_WRITE,
  );

  return (
    <IssueDetailClient
      issueId={issueId}
      initialIssue={d.issue}
      initialLines={d.lines}
      ingredients={ingredients}
      canAdjustStock={canAdjustStock}
      auditLogs={auditLogs}
      listBasePath={listBasePath}
      embedded={embedded}
    />
  );
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <IssueDetailPageContent
      issueId={Number(id)}
      listBasePath="/inventory/issues"
    />
  );
}
