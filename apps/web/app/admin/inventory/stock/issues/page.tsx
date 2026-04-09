import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchStockIssues } from "../../issue-actions";
import { IssuesListClient } from "../../issues/issues-list-client";
import type { StockIssueRow } from "../../issues/issues-list-client";
import { PageHeader } from "@/components/foundation/ui-patterns";

export default async function StockIssuesPage() {
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
  const defaultBranchId = claims?.branch_id ?? branches[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phiếu xuất kho"
        description="Quản lý phiếu xuất kho thủ công"
      />
      <IssuesListClient
        initial={rows}
        branches={branches}
        defaultBranchId={defaultBranchId}
      />
    </div>
  );
}
