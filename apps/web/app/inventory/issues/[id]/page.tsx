import { notFound } from "next/navigation";
import { fetchStockIssueDetail } from "../../issue-actions";
import { fetchIngredients } from "../../actions";
import { IssueDetailClient } from "./issue-detail-client";
import type { IngredientRow } from "../../page";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IssueDetailPage({ params }: Props) {
  const { id } = await params;
  const issueId = Number(id);
  if (!Number.isFinite(issueId) || issueId <= 0) notFound();

  const [detailRes, ingredientsRes] = await Promise.all([
    fetchStockIssueDetail(issueId),
    fetchIngredients(),
  ]);

  if (!detailRes.success || !detailRes.data) notFound();

  const { issue, lines } = detailRes.data as {
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
    lines: {
      id: number;
      ingredient_id: number;
      quantity: number;
      unit: string;
      unit_cost: number;
      total_cost: number;
      reason: string | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }[];
  };

  const ingredients: IngredientRow[] = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <IssueDetailClient
      issueId={issueId}
      initialIssue={issue}
      initialLines={lines}
      ingredients={ingredients}
    />
  );
}
