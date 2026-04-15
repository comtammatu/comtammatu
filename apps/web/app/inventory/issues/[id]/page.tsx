import { notFound } from "next/navigation";
import { fetchIngredients } from "../../actions";
import { fetchStockIssueDetail } from "../../issue-actions";
import { IssueDetailClient } from "./issue-detail-client";
import type { IngredientRow } from "../../page";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issueId = Number(id);
  if (!Number.isFinite(issueId) || issueId <= 0) notFound();

  const [res, ingredientsRes] = await Promise.all([
    fetchStockIssueDetail(issueId),
    fetchIngredients(),
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
      branches: { id: number; name: string } | null;
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
  const ingredients: IngredientRow[] = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <IssueDetailClient
      issueId={issueId}
      initialIssue={d.issue}
      initialLines={d.lines}
      ingredients={ingredients}
    />
  );
}
