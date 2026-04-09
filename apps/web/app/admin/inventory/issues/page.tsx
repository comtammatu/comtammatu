import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchStockIssues } from "../issue-actions";
import { IssuesListClient } from "./issues-list-client";
import type { StockIssueRow } from "./issues-list-client";

export default async function IssuesPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const [issuesRes, branchesRes] = await Promise.all([
    fetchStockIssues(),
    supabase
      .from("branches")
      .select("id, name")
      .order("is_headquarters", { ascending: false })
      .order("name"),
  ]);

  const rows: StockIssueRow[] = issuesRes.success
    ? ((issuesRes.data ?? []) as StockIssueRow[])
    : [];

  const branches: { id: number; name: string }[] = branchesRes.data ?? [];

  // branch_manager can only create for their own branch
  const defaultBranchId = claims?.branch_id ?? branches[0]?.id ?? null;

  return (
    <IssuesListClient
      initial={rows}
      branches={branches}
      defaultBranchId={defaultBranchId}
    />
  );
}
