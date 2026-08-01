import { notFound } from "next/navigation";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { fetchBranchQueueCounts } from "../dashboard/data";
import { fetchTeamBoard, type TeamBoardRow } from "./data";
import { TeamBoardClient } from "./team-board-client";
import { TeamMembersContent } from "./members/members-content";
import {
  TeamWorkspaceTabs,
  type TeamWorkspaceTabValue,
} from "./team-workspace-tabs";

const copy = messages.operator.teamBoard;
const validTabs = new Set<TeamWorkspaceTabValue>([
  "board",
  "members",
]);

export default async function TeamBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedTab = resolvedSearchParams.tab;
  const activeTab: TeamWorkspaceTabValue = validTabs.has(
    requestedTab as TeamWorkspaceTabValue,
  )
    ? (requestedTab as TeamWorkspaceTabValue)
    : "board";

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

  const [canViewTeam, canApproveCheckout, canApproveCount, canApproveLeave] =
    await Promise.all([
      probePermission(
        { supabase, claims },
        PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
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
      probePermission(
        { supabase, claims },
        PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
        context.branchId,
      ),
    ]);
  const canSeeApprovals =
    canApproveCheckout || canApproveCount || canApproveLeave;
  const [result, queueCounts] = await Promise.all([
    canViewTeam
      ? fetchTeamBoard({ branchId: context.branchId })
      : Promise.resolve({ success: false as const, error: "Không có quyền" }),
    canSeeApprovals
      ? fetchBranchQueueCounts(
          supabase,
          claims,
          context.branchId,
          context.branch.branch_kind,
        )
      : Promise.resolve(null),
  ]);
  const rows: TeamBoardRow[] = result.success ? (result.data?.rows ?? []) : [];
  const basePath = `/br/${context.branchId}`;
  const isStoreBranch = context.branch.branch_kind === "branch";

  const content = (
    <TeamWorkspaceTabs
      initialValue={activeTab}
      board={
        !canViewTeam ? (
          <AppEmptyState mode="no-access" />
        ) : result.success ? (
          <TeamBoardClient
            rows={rows}
            branchId={context.branchId}
            countSlipsHref={`${basePath}/stock/count-slips`}
            checkoutApprovalsHref={`${basePath}/shift/checkout-approvals`}
            leaveApprovalsHref={
              canApproveLeave && isStoreBranch
                ? `${basePath}/shift/leave-approvals`
                : undefined
            }
            canApproveCheckout={canApproveCheckout}
            canApproveCount={canApproveCount}
            approverRole={claims.user_role}
            approvalCounts={
              queueCounts
                ? {
                    checkoutPending: queueCounts.pendingCheckouts ?? undefined,
                    leavePending: queueCounts.pendingLeaveRequests ?? undefined,
                    countSlipsPending: queueCounts.pendingCountSlips ?? undefined,
                  }
                : undefined
            }
          />
        ) : (
          <AppEmptyState mode="error" description={result.error} />
        )
      }
      members={
        canViewTeam ? (
          <TeamMembersContent branchId={context.branchId} />
        ) : (
          <AppEmptyState mode="no-access" />
        )
      }
    />
  );

  return (
    <BranchOperatorPage title={copy.title} hideHeaderOnMobile>
      {content}
    </BranchOperatorPage>
  );
}
