import { notFound, redirect } from "next/navigation";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
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
const HUB_TABS: TeamWorkspaceTabValue[] = ["board", "members"];

/** Legacy hub tabs → full routes (keeps old notification / bookmark URLs alive). */
function redirectLegacyTeamTab(
  branchId: number,
  tab: string | undefined,
  search: {
    week?: string;
    attendanceId?: string | string[];
  },
): void {
  switch (tab) {
    case "roster": {
      const week = search.week
        ? `?week=${encodeURIComponent(search.week)}`
        : "";
      redirect(`/br/${branchId}/shift/roster${week}`);
      return;
    }
    case "attendance":
      redirect(`/br/${branchId}/shift/attendance`);
      return;
    case "checkouts": {
      const raw = search.attendanceId;
      const attendanceId = Array.isArray(raw) ? raw[0] : raw;
      const query = attendanceId
        ? `?attendanceId=${encodeURIComponent(attendanceId)}`
        : "";
      redirect(`/br/${branchId}/shift/checkout-approvals${query}`);
      return;
    }
    case "leaves":
      redirect(`/br/${branchId}/shift/leave-approvals`);
      return;
    default:
      return;
  }
}

export default async function TeamBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{
    tab?: string;
    week?: string;
    attendanceId?: string | string[];
  }>;
}) {
  const { branchId: rawBranchId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedTab = resolvedSearchParams.tab;

  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  redirectLegacyTeamTab(branchId, requestedTab, resolvedSearchParams);

  const activeTab: TeamWorkspaceTabValue = HUB_TABS.includes(
    requestedTab as TeamWorkspaceTabValue,
  )
    ? (requestedTab as TeamWorkspaceTabValue)
    : "board";

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

  const [
    canViewTeam,
    canApproveCheckout,
    canForceClose,
    canApproveCount,
    canAssignCount,
    canApproveLeave,
    canRoster,
    canViewAttendance,
  ] = await Promise.all([
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
      PERMISSION_KEYS.HR_FORCE_CLOSE_ATTENDANCE,
      context.branchId,
    ),
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
      context.branchId,
    ),
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
      context.branchId,
    ),
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
      context.branchId,
    ),
    canAccess(claims.user_role, "branch_shift_roster"),
    canAccess(claims.user_role, "branch_shift_attendance"),
  ]);

  const isStoreBranch = context.branch.branch_kind === "branch";
  const canSeeApprovals =
    activeTab === "board" &&
    (canApproveCheckout || canApproveCount || canApproveLeave);

  const [result, queueCounts] = await Promise.all([
    activeTab === "board" && canViewTeam
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
  const activeEmployeeCount = result.success
    ? (result.data?.activeEmployeeCount ?? 0)
    : 0;
  const basePath = `/br/${context.branchId}`;

  return (
    <BranchOperatorPage title={copy.title} description={context.branch.name}>
      <TeamWorkspaceTabs
        initialValue={activeTab}
        board={
          activeTab !== "board" ? null : !canViewTeam ? (
            <AppEmptyState mode="no-access" />
          ) : result.success ? (
            <TeamBoardClient
              rows={rows}
              activeEmployeeCount={activeEmployeeCount}
              branchId={context.branchId}
              membersHref={`${basePath}/team?tab=members`}
              countSlipsHref={`${basePath}/stock/count-slips`}
              countAssignmentsHref={
                canAssignCount
                  ? `${basePath}/stock/count-assignments`
                  : undefined
              }
              checkoutApprovalsHref={`${basePath}/shift/checkout-approvals`}
              leaveApprovalsHref={
                canApproveLeave && isStoreBranch
                  ? `${basePath}/shift/leave-approvals`
                  : undefined
              }
              rosterHref={
                canRoster ? `${basePath}/shift/roster` : undefined
              }
              attendanceHref={
                canViewAttendance && canViewTeam
                  ? `${basePath}/shift/attendance`
                  : undefined
              }
              canApproveCheckout={canApproveCheckout}
              canForceClose={canForceClose}
              canApproveCount={canApproveCount}
              approverRole={claims.user_role as StaffRole}
              approvalCounts={
                queueCounts
                  ? {
                      checkoutPending: queueCounts.pendingCheckouts ?? undefined,
                      leavePending: queueCounts.pendingLeaveRequests ?? undefined,
                      countSlipsPending:
                        queueCounts.pendingCountSlips ?? undefined,
                    }
                  : undefined
              }
            />
          ) : (
            <AppEmptyState mode="error" description={result.error} />
          )
        }
        members={
          activeTab !== "members" ? null : canViewTeam ? (
            <TeamMembersContent branchId={context.branchId} />
          ) : (
            <AppEmptyState mode="no-access" />
          )
        }
      />
    </BranchOperatorPage>
  );
}
