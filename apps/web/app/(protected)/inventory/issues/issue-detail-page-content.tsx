import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { fetchIngredients } from "../ingredient-actions";
import { fetchStockIssueDetail } from "../issue-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { IssueDetailClient } from "./[id]/issue-detail-client";
import type { IngredientRow } from "@lib/inventory/types";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";

interface IssueDetailPageContentProps {
  issueId: number;
  listBasePath?: string;
}

export async function IssueDetailPageContent({
  issueId,
  listBasePath = "/inventory/consumption",
}: IssueDetailPageContentProps) {
  if (!Number.isFinite(issueId) || issueId <= 0) notFound();

  const [res, ingredientsRes, auditLogs] = await Promise.all([
    fetchStockIssueDetail(issueId),
    fetchIngredients(),
    fetchEntityAuditLogs("stock_issue", issueId, 50),
  ]);

  if (!res.success || !res.data) notFound();

  const d = res.data as {
    tenantId: number;
    issue: {
      id: number;
      issue_number: string;
      issue_type: string;
      status: string;
      approval_status: string;
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
      baseUnit: string;
      toBaseFactor: number;
      entry_unit_id: number | null;
      monetary: { unitCost: number; totalCost: number } | null;
      reason: string | null;
      photo_urls: string[];
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };
  const baseIngredients: IngredientRow[] = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];
  const stockLevelByIngredient = new Map<
    number,
    {
      current_quantity: number;
      monetary: { avgUnitCost: number | null } | null;
    }
  >();
  if (d.issue.source_location_id && baseIngredients.length > 0) {
    const { supabase, claims } = await loadAuthState();
    const monetary = await loadInventoryMonetaryAccess(claims.user_role);
    const readClient = monetary.valuation
      ? (monetary.client ?? supabase)
      : supabase;
    const stockQuery = monetary.valuation
      ? readClient
          .from("stock_levels")
          .select("ingredient_id, current_quantity, avg_unit_cost")
      : readClient
          .from("stock_levels")
          .select("ingredient_id, current_quantity");
    const { data: stockLevels } = await stockQuery
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", d.issue.branch_id)
      .eq("location_id", d.issue.source_location_id);
    for (const row of stockLevels ?? []) {
      stockLevelByIngredient.set(row.ingredient_id, {
        current_quantity: Number(row.current_quantity ?? 0),
        monetary:
          monetary.valuation &&
          "avg_unit_cost" in row &&
          row.avg_unit_cost != null
            ? { avgUnitCost: Number(row.avg_unit_cost) }
            : null,
      });
    }
  }
  const ingredients = baseIngredients.map((ingredient) => {
    const stockLevel = stockLevelByIngredient.get(ingredient.id);
    return {
      ...ingredient,
      current_quantity: stockLevel?.current_quantity ?? 0,
      stockMonetary: stockLevel?.monetary ?? null,
    };
  });
  const canAdjustStock = await currentUserHasPermission(
    d.issue.branch_id,
    PERMISSION_KEYS.INVENTORY_WRITE,
  );

  return (
    <IssueDetailClient
      issueId={issueId}
      tenantId={d.tenantId}
      initialIssue={d.issue}
      initialLines={d.lines}
      ingredients={ingredients}
      canViewMonetary={d.lines.some((line) => line.monetary != null)}
      canAdjustStock={canAdjustStock}
      auditLogs={auditLogs}
      listBasePath={listBasePath}
    />
  );
}
