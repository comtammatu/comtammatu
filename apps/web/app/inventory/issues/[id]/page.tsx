import { notFound } from "next/navigation";
import { fetchStockIssueDetail } from "../../issue-actions";
import { formatDate } from "../../_lib/format";
import { IssueDetailClient } from "./issue-detail-client";
import type { IssueDetail } from "./issue-detail-client";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetchStockIssueDetail(Number(id));
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

  const branch = d.issue.branches as { id: number; name: string } | null;

  const items: IssueDetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
    } | null;
    return {
      name: ing?.name ?? "—",
      sku: "",
      qty: Number(l.quantity ?? 0),
      unit: l.unit ?? ing?.unit ?? "",
      cost: Number(l.unit_cost ?? 0),
      total: Number(l.total_cost ?? 0),
      note: l.reason ?? "",
    };
  });

  const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

  const issueDetail: IssueDetail = {
    code: d.issue.issue_number ?? "",
    status: d.issue.status ?? "draft",
    branch: branch?.name ?? `Chi nhánh #${d.issue.branch_id}`,
    date: d.issue.issued_at ? formatDate(d.issue.issued_at) : "—",
    type: d.issue.issue_type ?? "consumption",
    createdBy: "—",
    total: totalAmount,
    items,
  };

  return <IssueDetailClient issueDetail={issueDetail} />;
}
