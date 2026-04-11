import { fetchStockIssues } from "../issue-actions";
import { formatDate } from "../_lib/format";
import { IssuesClient } from "./issues-client";
import type { IssueRow } from "./issues-client";

export default async function IssuesPage() {
  const res = await fetchStockIssues();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const issues: IssueRow[] = dbRows.map((row) => ({
    id: row.id as number,
    code: (row.issue_number as string) ?? "",
    type: (row.issue_type as string) ?? "consumption",
    branchName:
      ((row.branches as Record<string, unknown>)?.name as string) ?? "—",
    date: row.issued_at ? formatDate(row.issued_at as string) : "—",
    createdBy: "—",
    status: (row.status as string) ?? "draft",
  }));

  return <IssuesClient issues={issues} />;
}
