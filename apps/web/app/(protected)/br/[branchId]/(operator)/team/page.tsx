import { notFound } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { AppEmptyState, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { fetchTeamBoard, type TeamBoardRow } from "./data";
import { TeamBoardClient } from "./team-board-client";

const copy = messages.employee.teamBoard;

function parseBranchId(raw: string): number | null {
  const branchId = Number(raw);
  return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
}

export default async function TeamBoardPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  if (!canAccess(claims.user_role, "branch_team")) {
    return (
      <>
        <AppPageHeader
          title={copy.title}
          className="sr-only sm:not-sr-only"
        />
        <AppEmptyState mode="no-access" />
      </>
    );
  }

  const result = await fetchTeamBoard({ branchId: context.branchId });
  const rows: TeamBoardRow[] = result.success ? (result.data?.rows ?? []) : [];
  const basePath = `/br/${context.branchId}`;

  return (
    <>
      <AppPageHeader
        title={copy.title}
        description={copy.description}
        className="sr-only sm:not-sr-only"
      />
      {result.success ? (
        <TeamBoardClient
          rows={rows}
          countSlipsHref={`${basePath}/stock/count-slips`}
          checkoutApprovalsHref={`${basePath}/shift/checkout-approvals`}
        />
      ) : (
        <AppEmptyState mode="error" description={result.error} />
      )}
    </>
  );
}
