import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { messages } from "@lib/messages";
import { PosSessionsListClient } from "./pos-sessions-client";
import { isPosSessionWorkItem, normalizeSessionRows } from "./_lib/normalize";

const PAGE_SIZE = 20;
const SESSION_SELECT = `
  id,
  terminal_id,
  opened_by,
  closed_by,
  opened_at,
  closed_at,
  opening_cash,
  closing_cash,
  expected_cash,
  cash_difference,
  status,
  note,
  variance_approval_note,
  variance_approver_user_id,
  pos_terminals!pos_sessions_terminal_id_fkey (name),
  opened_by_profile:profiles!pos_sessions_opened_by_fkey (full_name),
  closed_by_profile:profiles!pos_sessions_closed_by_fkey (full_name)
`;

export default async function BranchPosSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const [{ branchId: branchIdStr }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();
  const view = query.view === "history" ? "history" : "current";
  const requestedPage = Number(query.page);
  const page =
    view === "history" && Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  if (!(await canAccessBranch(supabase, claims, branchId))) {
    notFound();
  }

  const sessionsPromise =
    view === "history"
      ? supabase
          .from("pos_sessions")
          .select(SESSION_SELECT)
          .eq("branch_id", branchId)
          .eq("tenant_id", claims.tenant_id)
          .neq("status", "open")
          .order("opened_at", { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      : Promise.all([
          supabase
            .from("pos_sessions")
            .select(SESSION_SELECT)
            .eq("branch_id", branchId)
            .eq("tenant_id", claims.tenant_id)
            .eq("status", "open"),
          supabase
            .from("pos_sessions")
            .select(SESSION_SELECT)
            .eq("branch_id", branchId)
            .eq("tenant_id", claims.tenant_id)
            .neq("status", "open")
            .is("variance_approval_note", null)
            .or("cash_difference.gt.50000,cash_difference.lt.-50000"),
        ]).then(([openResult, varianceResult]) => ({
          data: [...(openResult.data ?? []), ...(varianceResult.data ?? [])],
          error: openResult.error ?? varianceResult.error,
        }));

  const [{ data: branch, error: branchError }, { data: sessions, error }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, is_active")
        .eq("id", branchId)
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .maybeSingle(),
      sessionsPromise,
    ]);

  if (branchError || !branch) notFound();
  if (error) throw new Error(messages.settings.branch.posSessionsLoadFailed);

  const normalizedSessions = normalizeSessionRows(sessions);
  const hasNextPage =
    view === "history" && normalizedSessions.length > PAGE_SIZE;
  const visibleSessions = (
    view === "history"
      ? normalizedSessions.slice(0, PAGE_SIZE)
      : normalizedSessions.filter(isPosSessionWorkItem)
  ).sort((a, b) => b.opened_at.localeCompare(a.opened_at));

  return (
    <BranchOperatorPage
      title={messages.settings.pages.posSessionsTitle}
      description={messages.settings.pages.posSessionsDescription}
    >
      <PosSessionsListClient
        branchId={branchId}
        sessions={visibleSessions}
        view={view}
        page={page}
        hasNextPage={hasNextPage}
      />
    </BranchOperatorPage>
  );
}
