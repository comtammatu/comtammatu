import { notFound } from "next/navigation";
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
import { RosterTab } from "./_tabs/roster-tab";
import { AttendanceTab } from "./_tabs/attendance-tab";
import { CheckoutsTab } from "./_tabs/checkouts-tab";
import { LeavesTab } from "./_tabs/leaves-tab";
import {
  TeamWorkspaceTabs,
  type TeamWorkspaceTabValue,
} from "./team-workspace-tabs";

const copy = messages.operator.teamBoard;
const ALL_TABS: TeamWorkspaceTabValue[] = [
  "board",
  "members",
  "roster",
  "attendance",
  "checkouts",
  "leaves",
];

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
  const activeTab: TeamWorkspaceTabValue = ALL_TABS.includes(
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

  const [
    canViewTeam,
    canApproveCheckout,
    canApproveCount,
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
      PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
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

  // Resolve which manager tabs are visible for this role. Board + members are
  // always visible to anyone with `branch_team`; the rest require their
  // module/permission.
  const visibleTabs: TeamWorkspaceTabValue[] = ["board", "members"];
  if (canRoster) visibleTabs.push("roster");
  if (canViewAttendance && canViewTeam) visibleTabs.push("attendance");
  if (canApproveCheckout) visibleTabs.push("checkouts");
  if (canApproveLeave) visibleTabs.push("leaves");

  // Guard: if the requested tab isn't visible, fall back to board server-side
  // (the client component also clamps, this avoids fetching forbidden data).
  const effectiveTab: TeamWorkspaceTabValue = visibleTabs.includes(activeTab)
    ? activeTab
    : "board";

  const isStoreBranch = context.branch.branch_kind === "branch";
  const canSeeApprovals =
    effectiveTab === "board" &&
    (canApproveCheckout || canApproveCount || canApproveLeave);

  const [result, queueCounts] = await Promise.all([
    effectiveTab === "board" && canViewTeam
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

  // Forwarded deep-link params from the legacy redirect shims.
  const rawAttendanceId = resolvedSearchParams.attendanceId;
  const focusAttendanceId = Number(
    Array.isArray(rawAttendanceId) ? rawAttendanceId[0] : rawAttendanceId,
  );

  return (
    <BranchOperatorPage title={copy.title} description={context.branch.name}>
      <TeamWorkspaceTabs
        initialValue={effectiveTab}
        visibleTabs={visibleTabs}
        board={
          effectiveTab !== "board" ? null : !canViewTeam ? (
            <AppEmptyState mode="no-access" />
          ) : result.success ? (
            <TeamBoardClient
              rows={rows}
              branchId={context.branchId}
              countSlipsHref={`${basePath}/stock/count-slips`}
              checkoutApprovalsHref={`${basePath}/team?tab=checkouts`}
              leaveApprovalsHref={
                canApproveLeave && isStoreBranch
                  ? `${basePath}/team?tab=leaves`
                  : undefined
              }
              canApproveCheckout={canApproveCheckout}
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
          effectiveTab !== "members" ? null : canViewTeam ? (
            <TeamMembersContent branchId={context.branchId} />
          ) : (
            <AppEmptyState mode="no-access" />
          )
        }
        roster={
          effectiveTab !== "roster" || !canRoster ? null : (
            <RosterTab branchId={context.branchId} week={resolvedSearchParams.week} />
          )
        }
        attendance={
          effectiveTab !== "attendance" || !canViewAttendance ? null : (
            <AttendanceTab branchId={context.branchId} />
          )
        }
        checkouts={
          effectiveTab !== "checkouts" || !canApproveCheckout ? null : (
            <CheckoutsTab
              branchId={context.branchId}
              attendanceId={
                Number.isInteger(focusAttendanceId) && focusAttendanceId > 0
                  ? focusAttendanceId
                  : undefined
              }
            />
          )
        }
        leaves={
          effectiveTab !== "leaves" || !canApproveLeave ? null : (
            <LeavesTab branchId={context.branchId} />
          )
        }
      />
    </BranchOperatorPage>
  );
}
