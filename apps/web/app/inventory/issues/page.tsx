import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchStockIssues } from "../issue-actions";
import { formatDate } from "../_lib/format";
import { IssuesClient } from "./issues-client";
import type { IssueBranchOption, IssueRow } from "./issues-client";

export default async function IssuesPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const [res, branchesRes] = await Promise.all([
    fetchStockIssues(),
    supabase
      .from("branches")
      .select("id, name")
      .order("branch_kind")
      .order("name"),
  ]);
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];
  const allBranches = (branchesRes.data ?? []) as IssueBranchOption[];
  const branches =
    claims?.branch_id != null
      ? allBranches.filter((branch) => branch.id === claims.branch_id)
      : allBranches;

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

  return (
    <IssuesClient
      issues={issues}
      branches={branches}
      defaultBranchId={claims?.branch_id ?? branches[0]?.id ?? null}
    />
  );
}
