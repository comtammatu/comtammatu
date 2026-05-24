import { loadAuthState } from "@/_lib/auth";
import { fetchStockIssues } from "../issue-actions";
import { formatDate } from "../_lib/format";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
import { IssuesClient } from "./issues-client";
import type { IssueBranchOption, IssueRow } from "./issues-client";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = await resolveRequestedBranchId(params.branchId);
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const branchFilter = scope.selectedBranchId ?? undefined;

  const res = await fetchStockIssues(
    branchFilter != null ? { branchId: branchFilter } : undefined,
  );
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];
  const branches: IssueBranchOption[] = scope.allowedBranches.map((b) => ({
    id: b.id,
    name: b.name,
    branchKind: b.branch_kind,
  }));

  const issues: IssueRow[] = dbRows.map((row) => {
    const branches = row.branches as Record<string, unknown> | null;
    return {
      id: row.id as number,
      code: (row.issue_number as string) ?? "",
      type: (row.issue_type as string) ?? "consumption",
      branchName: (branches?.name as string) ?? "—",
      branchKind: (branches?.branch_kind as string | null) ?? null,
      date: row.issued_at ? formatDate(row.issued_at as string) : "—",
      createdBy: "—",
      status: (row.status as string) ?? "draft",
    };
  });

  return (
    <IssuesClient
      issues={issues}
      branches={branches}
      defaultBranchId={scope.selectedBranchId ?? branches[0]?.id ?? null}
    />
  );
}
