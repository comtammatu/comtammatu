import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { fetchTeamBoard, type TeamBoardRow } from "./data";
import { TeamBoardClient } from "./team-board-client";
import { TeamAssignmentsContent } from "./assignments/assignments-content";
import { TeamMembersContent } from "./members/members-content";
import {
  TeamWorkspaceTabs,
  type TeamWorkspaceTabValue,
} from "./team-workspace-tabs";

const copy = messages.operator.teamBoard;
const validTabs = new Set<TeamWorkspaceTabValue>([
  "board",
  "members",
  "assignments",
]);

export default async function TeamBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{
    tab?: string;
    locationId?: string | string[];
    shiftId?: string | string[];
  }>;
}) {
  const { branchId: rawBranchId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedTab = resolvedSearchParams.tab;

  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  if (!canAccess(claims.user_role, "branch_team")) {
    return (
      <BranchOperatorPage title={copy.title}>
        <AppEmptyState mode="no-access" />
      </BranchOperatorPage>
    );
  }

  const [canViewTeam, canAssignCount, canApproveCheckout, canApproveCount] =
    await Promise.all([
      probePermission(
        { supabase, claims },
        PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
        context.branchId,
      ),
      probePermission(
        { supabase, claims },
        PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
        context.branchId,
      ),
      probePermission(
        { supabase, claims },
        PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
        context.branchId,
      ),
      probePermission(
        { supabase, claims },
        PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
        context.branchId,
      ),
    ]);
  const basePath = `/br/${context.branchId}`;
  const teamPath = `${basePath}/team`;
  const availableTabs: TeamWorkspaceTabValue[] = [
    ...(canViewTeam ? (["board", "members"] as const) : []),
    ...(canAssignCount ? (["assignments"] as const) : []),
  ];
  const requestedTabValue = validTabs.has(requestedTab as TeamWorkspaceTabValue)
    ? (requestedTab as TeamWorkspaceTabValue)
    : null;
  const activeTab =
    requestedTabValue && availableTabs.includes(requestedTabValue)
      ? requestedTabValue
      : availableTabs[0];

  if (!activeTab) {
    return (
      <BranchOperatorPage title={copy.title}>
        <AppEmptyState mode="no-access" />
      </BranchOperatorPage>
    );
  }

  let activeContent: ReactNode;
  if (activeTab === "board") {
    const result = await fetchTeamBoard({ branchId: context.branchId });
    const rows: TeamBoardRow[] = result.success
      ? (result.data?.rows ?? [])
      : [];
    activeContent = result.success ? (
      <TeamBoardClient
        rows={rows}
        branchId={context.branchId}
        countSlipsHref={`${basePath}/stock/count-slips`}
        checkoutApprovalsHref={`${basePath}/shift/checkout-approvals`}
        canApproveCheckout={canApproveCheckout}
        canApproveCount={canApproveCount}
      />
    ) : (
      <AppEmptyState mode="error" description={result.error} />
    );
  } else if (activeTab === "members") {
    activeContent = <TeamMembersContent branchId={context.branchId} />;
  } else {
    activeContent = (
      <TeamAssignmentsContent
        branchId={context.branchId}
        locationParam={resolvedSearchParams.locationId}
        shiftParam={resolvedSearchParams.shiftId}
      />
    );
  }

  return (
    <BranchOperatorPage
      title={copy.title}
      description={copy.description}
      hideHeaderOnMobile
    >
      <TeamWorkspaceTabs
        activeValue={activeTab}
        availableValues={availableTabs}
        basePath={teamPath}
      >
        {activeContent}
      </TeamWorkspaceTabs>
    </BranchOperatorPage>
  );
}
