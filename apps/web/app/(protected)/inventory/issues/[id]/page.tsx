import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
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
}

export async function IssueDetailPageContent({
  issueId,
  routeBranchId,
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
    issue: {
      id: number;
      issue_number: string;
      issue_type: string;
      status: string;
      notes: string | null;
      issued_at: string;
      branch_id: number;
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
      unit_cost: number;
      total_cost: number;
      reason: string | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };
  if (routeBranchId != null && d.issue.branch_id !== routeBranchId) notFound();
  const ingredients: IngredientRow[] = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];
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
    />
  );
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IssueDetailPageContent issueId={Number(id)} />;
}
