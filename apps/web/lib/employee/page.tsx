/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: manager shift action panel keeps operational copy inline */
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  Camera as IconCamera,
  CheckCircle2 as IconDone,
  ClipboardCheck as IconClipboardCheck,
  Clock as IconClock,
  ListChecks as IconListChecks,
  LogOut as IconLogout,
  UserCircle as IconUserCircle,
  Users as IconUsers,
} from "lucide-react";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@comtammatu/ui/components/item";
import { loadAuthState } from "@/_lib/auth";
import { NotificationPopupControl } from "@/_components/notification-popup-control";
import { messages } from "@lib/messages";
import {
  EmployeeControlBar,
  EmployeeInlineState,
  EmployeePanel,
  EmployeePage as EmployeePageShell,
  EmployeeStatusStrip,
} from "./components/employee-page";
import {
  getTodayWorkState,
  type TodayShiftEntry,
  type TodayWorkState,
  type TodayWorkStatus,
} from "./_lib/today-work-state";
import { formatDateVN, formatTimeVN } from "./_lib/vn-business-date";
import { AppEmptyState } from "@/components/surface";
import { TasksClient } from "./tasks/tasks-client";
import { EmployeeCountPanelContent } from "./count/page";

const copy = messages.employee.home;

// Must mirror CHECKOUT_APPROVER_ROLES in checkout-approvals/page.tsx —
// the card and its destination route gate on the same set.
const CHECKOUT_APPROVER_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

export type EmployeeHomeRoutes = {
  clock: string;
  tasks: string;
  schedule: string;
  profile: string;
  checkoutApprovals: string;
  count: string;
  wasteApprovals: string;
  leaveApprovals?: string;
  countSlips?: string;
  countAssignments?: string;
  team?: string;
  hr?: string;
};

const DEFAULT_HOME_ROUTES: EmployeeHomeRoutes = {
  clock: "/br",
  tasks: "/br",
  schedule: "/br",
  profile: "/br",
  checkoutApprovals: "/br",
  count: "/br",
  wasteApprovals: "/inventory/waste/approvals",
};

type EmployeeHomeAuthState = Awaited<ReturnType<typeof loadAuthState>>;
type EmployeeHomeWorkflowLayout = "standard" | "stepper";
type StepTone = "default" | "success" | "warning" | "info";
type StepBadgeVariant = NonNullable<BadgeProps["variant"]>;

type ShiftWorkflowStep = {
  key: string;
  number: number;
  icon: ElementType;
  title: string;
  description?: ReactNode;
  statusLabel: string;
  statusVariant: StepBadgeVariant;
  tone: StepTone;
  content?: ReactNode;
};

function ShiftWorkflowPanel({ steps }: { steps: ShiftWorkflowStep[] }) {
  return (
    <EmployeePanel
      icon={IconListChecks}
      title={copy.workflowTitle}
      contentClassName="gap-2"
      size="sm"
    >
      <div className="flex flex-col gap-2">
        {steps.map((step) => {
          const hasContent = Boolean(step.content);
          return (
            <EmployeeInlineState
              key={step.key}
              icon={step.icon}
              title={
                <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.workflowStep(step.number)}
                  </span>
                  <span>{step.title}</span>
                </span>
              }
              description={step.description}
              tone={step.tone}
              actions={
                <Badge variant={step.statusVariant}>{step.statusLabel}</Badge>
              }
              className={
                hasContent ? "items-start bg-background" : "bg-background"
              }
            >
              {hasContent ? (
                <div className="mt-3 flex w-full flex-col gap-3">
                  {step.content}
                </div>
              ) : null}
            </EmployeeInlineState>
          );
        })}
      </div>
    </EmployeePanel>
  );
}

function getShiftStateBadge(shift: TodayShiftEntry): {
  label: string;
  variant: "success" | "warning" | "info" | "secondary";
} {
  if (shift.checkOut) return { label: copy.shiftDone, variant: "success" };
  if (shift.checkoutRequestedAt) {
    return { label: copy.shiftPending, variant: "warning" };
  }
  if (shift.checkIn) return { label: copy.shiftWorking, variant: "info" };
  return { label: copy.shiftNotStarted, variant: "secondary" };
}

function getWorkTone(status: TodayWorkStatus) {
  if (status === "done") return "success" as const;
  if (status === "checkout_pending") return "warning" as const;
  if (status === "working" || status === "not_required") {
    return "info" as const;
  }
  return "warning" as const;
}

function canRequestCheckout(state: TodayWorkState): boolean {
  return state.managerAttendanceOnly || state.checklist.requiredRemaining === 0;
}

function getWorkTitle(state: TodayWorkState): string {
  const status = state.status;
  if (state.managerAttendanceOnly) {
    if (status === "working") return copy.managerAttendanceTitle;
    if (status === "done") return copy.statusDone;
    if (status === "not_started") return copy.statusNotStarted;
  }

  if (status === "missing_profile") return copy.statusNoProfile;
  if (status === "missing_branch") return copy.statusNoBranch;
  if (status === "not_required") return copy.statusNotRequired;
  if (status === "not_started") return copy.statusNotStarted;
  if (status === "working") return copy.statusWorking;
  if (status === "checkout_pending") return copy.statusCheckoutPending;
  return copy.statusDone;
}

export async function EmployeeHomePageContent({
  routes = DEFAULT_HOME_ROUTES,
  authState,
  showNotificationControl = true,
  mode = "full",
  workflowLayout = "standard",
}: {
  routes?: EmployeeHomeRoutes;
  authState?: EmployeeHomeAuthState;
  showNotificationControl?: boolean;
  mode?: "full" | "today-card" | "compact-status" | "manager-dashboard";
  workflowLayout?: EmployeeHomeWorkflowLayout;
} = {}) {
  const { supabase, claims, session } = authState ?? (await loadAuthState());
  const state = await getTodayWorkState();

  // Checkout requests BLOCK the requesting employee until a manager
  // approves — the count surfaces the queue on the screen managers
  // already open, instead of three taps deep behind Profile.
  let pendingCheckouts = 0;
  if (CHECKOUT_APPROVER_ROLES.includes(claims.user_role)) {
    const service = createServiceClient();
    let countQuery = service
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .contains("checkout_approval_target_roles", [claims.user_role])
      .is("check_out", null)
      .not("checkout_requested_at", "is", null);
    if (claims.user_role === "branch_manager") {
      countQuery = countQuery.eq("branch_id", claims.branch_id ?? -1);
    }
    const permissionPromise =
      typeof claims.branch_id === "number"
        ? supabase.rpc("has_permission", {
            p_branch_id: claims.branch_id,
            p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
          })
        : supabase.rpc("has_permission_any", {
            p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
          });
    const [permissionResult, countResult] = await Promise.all([
      permissionPromise,
      countQuery,
    ]);
    if (permissionResult.data === true) {
      pendingCheckouts = countResult.count ?? 0;
    }
  }

  // Pending tier-2 waste writeoffs join the same approval queue — the D050
  // Phase 1 smart card shows ONE combined "needs approval" counter.
  let pendingWaste = 0;
  if (CHECKOUT_APPROVER_ROLES.includes(claims.user_role)) {
    let wasteQuery = supabase
      .from("stock_issues")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("issue_type", "writeoff")
      .eq("approval_status", "pending");
    if (claims.user_role === "branch_manager") {
      wasteQuery = wasteQuery.eq("branch_id", claims.branch_id ?? -1);
    }
    const wastePermissionPromise =
      typeof claims.branch_id === "number"
        ? supabase.rpc("has_permission", {
            p_branch_id: claims.branch_id,
            p_key: PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
          })
        : supabase.rpc("has_permission_any", {
            p_key: PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
          });
    const [wastePermissionResult, wasteCountResult] = await Promise.all([
      wastePermissionPromise,
      wasteQuery,
    ]);
    if (wastePermissionResult.data === true) {
      pendingWaste = wasteCountResult.count ?? 0;
    }
  }

  let pendingLeaveRequests = 0;
  let pendingCountSlips = 0;
  if (claims.user_role === "branch_manager" || claims.user_role === "owner") {
    const service = createServiceClient();
    const branchIdFilter = claims.branch_id ?? -1;

    const [leavePermissionResult, countPermissionResult] = await Promise.all([
      typeof claims.branch_id === "number"
        ? supabase.rpc("has_permission", {
            p_branch_id: claims.branch_id,
            p_key: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
          })
        : supabase.rpc("has_permission_any", {
            p_key: PERMISSION_KEYS.HR_APPROVE_LEAVE_REQUEST,
          }),
      typeof claims.branch_id === "number"
        ? supabase.rpc("has_permission", {
            p_branch_id: claims.branch_id,
            p_key: PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
          })
        : supabase.rpc("has_permission_any", {
            p_key: PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
          }),
    ]);

    const leavePromise = leavePermissionResult.data === true
      ? service
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchIdFilter)
          .eq("status", "pending")
      : Promise.resolve(null);

    const countPromise = countPermissionResult.data === true
      ? service
          .from("inventory_count_slips")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchIdFilter)
          .eq("status", "submitted")
      : Promise.resolve(null);

    const [leaveCountResult, countCountResult] = await Promise.all([
      leavePromise,
      countPromise,
    ]);

    if (leaveCountResult) pendingLeaveRequests = leaveCountResult.count ?? 0;
    if (countCountResult) pendingCountSlips = countCountResult.count ?? 0;
  }

  // Surface the count-slip task only when this employee actually has active
  // assignments — RLS + the inner-join on profile_id keep it to their own rows
  // (a manager who can read branch-wide assignments still only sees their own).
  let countAssignmentCount = 0;
  if (session?.user?.id) {
    const { count } = await supabase
      .from("inventory_count_assignments")
      .select("id, employees!inner(profile_id)", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .eq("employees.profile_id", session.user.id);
    countAssignmentCount = count ?? 0;
  }
  const activeBranchId = claims.branch_id ?? -1;
  const checkoutApprovalsRoute = routes.checkoutApprovals ?? `/br/${activeBranchId}/shift/checkout-approvals`;
  const leaveApprovalsRoute = routes.leaveApprovals ?? `/br/${activeBranchId}/shift/leave-approvals`;
  const countSlipsRoute = routes.countSlips ?? `/br/${activeBranchId}/stock/count-slips`;
  const countAssignmentsRoute = routes.countAssignments ?? `/br/${activeBranchId}/stock/count-assignments`;
  const teamRoute = routes.team ?? `/br/${activeBranchId}/team`;
  const hrRoute = routes.hr ?? `/hr`;

  const tone = getWorkTone(state.status);
  const title = getWorkTitle(state);
  const currentShiftName = state.attendance?.shiftName ?? null;
  const currentShiftRange = state.attendance?.shiftStartTime
    ? `${state.attendance.shiftStartTime.slice(0, 5)} - ${state.attendance.shiftEndTime?.slice(0, 5) ?? "—"}`
    : "—";

  const progressValue = state.managerAttendanceOnly
    ? state.attendance?.checkOut
      ? 100
      : state.attendance?.checkIn
        ? 50
        : 0
    : state.status === "done" || state.status === "checkout_pending"
      ? 100
      : state.status === "working" && state.checklist.total > 0
        ? Math.round((state.checklist.done / state.checklist.total) * 100)
        : state.attendance?.checkIn
          ? 50
          : 0;
  const progressHint = state.managerAttendanceOnly
    ? state.attendance?.checkOut
      ? copy.completed
      : state.attendance?.checkIn
        ? copy.managerProgressInShift
        : copy.notYet
    : state.checklist.total > 0
      ? `${state.checklist.done}/${state.checklist.total}`
      : state.status === "not_required"
        ? copy.descriptionNotRequired
        : state.status === "not_started" || state.status === "missing_branch"
          ? copy.notYet
          : title;
  const progressTone =
    tone === "success" ? "success" : tone === "warning" ? "warning" : "default";
  const progressBadgeVariant =
    tone === "success" ? "success" : tone === "warning" ? "warning" : "info";
  const primaryActionClassName = "w-full sm:w-fit sm:min-w-44";
  const todayMeta = currentShiftName
    ? `${formatDateVN(state.today)} · ${currentShiftName} ${currentShiftRange}`
    : formatDateVN(state.today);
  const checkOutDisplay =
    state.attendance?.checkOut ?? state.attendance?.checkoutRequestedAt ?? null;
  const todaySummaryItems = state.managerAttendanceOnly
    ? [
        {
          label: copy.checkInShort,
          value: state.attendance?.checkIn
            ? formatTimeVN(state.attendance.checkIn)
            : "—",
          muted: !state.attendance?.checkIn,
          mono: true,
        },
        {
          label: copy.checkOutShort,
          value: checkOutDisplay ? formatTimeVN(checkOutDisplay) : "—",
          muted: !checkOutDisplay,
          mono: true,
        },
      ]
    : [
        {
          label: copy.checkInShort,
          value: state.attendance?.checkIn
            ? formatTimeVN(state.attendance.checkIn)
            : "—",
          muted: !state.attendance?.checkIn,
          mono: true,
        },
        {
          label: copy.checkOutShort,
          value: checkOutDisplay ? formatTimeVN(checkOutDisplay) : "—",
          muted: !checkOutDisplay,
          mono: true,
        },
        {
          label: copy.tasksShort,
          value: progressHint,
          muted: state.checklist.total === 0,
          mono: true,
        },
      ];

  const primaryAction =
    state.status === "missing_profile" ? (
      <Button
        asChild
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
      >
        <Link href={routes.profile}>
          <IconUserCircle data-icon="inline-start" />
          {copy.profileTitle}
        </Link>
      </Button>
    ) : state.status === "missing_branch" ? (
      <Button
        asChild
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
      >
        <Link href={routes.profile}>
          <IconUserCircle data-icon="inline-start" />
          {copy.profileTitle}
        </Link>
      </Button>
    ) : state.status === "not_required" ? (
      <Button
        asChild
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
      >
        <Link href={routes.schedule}>
          <IconClock data-icon="inline-start" />
          {copy.viewSchedule}
        </Link>
      </Button>
    ) : state.status === "not_started" ? (
      <Button asChild size="touch-lg" className={primaryActionClassName}>
        <Link href={routes.clock}>
          <IconCamera data-icon="inline-start" />
          {copy.clockIn}
        </Link>
      </Button>
    ) : state.status === "working" ? (
      canRequestCheckout(state) ? (
        <Button asChild size="touch-lg" className={primaryActionClassName}>
          <Link href={routes.clock}>
            <IconLogout data-icon="inline-start" />
            {state.managerAttendanceOnly ? copy.clockOutDirect : copy.clockOut}
          </Link>
        </Button>
      ) : (
        <Button asChild size="touch-lg" className={primaryActionClassName}>
          <Link href={routes.tasks}>
            <IconListChecks data-icon="inline-start" />
            {copy.shiftTasks}
          </Link>
        </Button>
      )
    ) : state.status === "checkout_pending" ? (
      <Button
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
        disabled
      >
        <IconClock data-icon="inline-start" />
        {copy.checkoutPending}
      </Button>
    ) : (
      <Button
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
        disabled
      >
        <IconDone data-icon="inline-start" />
        {copy.completed}
      </Button>
    );

  const todayCard = (
    <EmployeePanel tone={tone} size="sm" contentClassName="gap-3">
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-heading text-xl font-semibold tracking-tight">
              {title}
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-muted-foreground">
              {todayMeta}
            </p>
          </div>
          <Badge variant={progressBadgeVariant} className="shrink-0">
            {progressValue}%
          </Badge>
        </div>
        {workflowLayout === "stepper" ? null : <div>{primaryAction}</div>}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">
              {copy.workProgress}
            </span>
            <span className="font-mono font-medium tabular-nums">
              {progressHint}
            </span>
          </div>
          <Progress value={progressValue} tone={progressTone} className="h-2" />
        </div>
        <EmployeeStatusStrip items={todaySummaryItems} />
      </div>
    </EmployeePanel>
  );

  if (mode === "today-card") return todayCard;

  if (mode === "compact-status") {
    const compactCta =
      state.status === "not_started" ? (
        <Button asChild size="touch">
          <Link href={routes.clock}>
            <IconCamera data-icon="inline-start" />
            {copy.clockIn}
          </Link>
        </Button>
      ) : null;

    return (
      <EmployeeControlBar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{todayMeta}</p>
        </div>
        {compactCta}
      </EmployeeControlBar>
    );
  }

  const activeWorkStatus =
    state.status === "working" ||
    state.status === "checkout_pending" ||
    state.status === "done";
  const countPanel =
    countAssignmentCount > 0 && activeWorkStatus ? (
      <div id="shift-inventory-count" className="flex flex-col gap-3">
        <EmployeeCountPanelContent
          searchParams={Promise.resolve({})}
          routeBranchId={state.branchId ?? undefined}
          baseHref={routes.tasks}
        />
      </div>
    ) : null;
  const checklistContent =
    state.checklist.items.length > 0 ? (
      <TasksClient
        items={state.checklist.items}
        disabled={
          state.status === "checkout_pending" || state.status === "done"
        }
        countHref={
          countAssignmentCount > 0 ? "#shift-inventory-count" : routes.count
        }
        checkoutHref={
          state.status === "working" && !canRequestCheckout(state)
            ? routes.clock
            : undefined
        }
        checkoutLabel={
          state.managerAttendanceOnly ? copy.clockOutDirect : copy.clockOut
        }
      />
    ) : (
      <AppEmptyState
        title={messages.employee.tasks.noChecklistTitle}
        description={messages.employee.tasks.noChecklistDescription}
        icon={<IconListChecks />}
      />
    );
  const shiftsTodaySection =
    state.todayShifts.length > 0 ? (
      <EmployeePanel icon={IconClock} title={copy.shiftsTodayTitle} size="sm">
        <div className="flex flex-col gap-2">
          {state.todayShifts.map((shift) => {
            const badge = getShiftStateBadge(shift);
            const shiftTimeRange = `${shift.checkIn ? formatTimeVN(shift.checkIn) : "—"} - ${
              shift.checkOut ? formatTimeVN(shift.checkOut) : "—"
            }`;
            return (
              <EmployeeInlineState
                key={shift.shiftId}
                title={shift.shiftName ?? "—"}
                description={
                  <span className="font-mono tabular-nums">
                    {shiftTimeRange}
                  </span>
                }
                actions={<Badge variant={badge.variant}>{badge.label}</Badge>}
                className="bg-background"
              />
            );
          })}
        </div>
      </EmployeePanel>
    ) : null;
  const staleOpenShiftSection = state.staleOpenShift ? (
    <EmployeePanel
      icon={IconClock}
      title={copy.staleShiftTitle}
      tone="warning"
      size="sm"
    >
      <p className="text-sm text-muted-foreground">
        {copy.staleShiftDescription(formatDateVN(state.staleOpenShift.date))}
      </p>
    </EmployeePanel>
  ) : null;
  const pendingApprovalsTotal = pendingCheckouts + pendingWaste;
  const checkoutApprovalsSection =
    pendingApprovalsTotal > 0 ? (
      <EmployeePanel
        icon={IconClipboardCheck}
        title={copy.approvalsQueueTitle}
        description={[
          pendingCheckouts > 0
            ? `${pendingCheckouts} ${copy.approvalsCheckoutUnit}`
            : null,
          pendingWaste > 0
            ? `${pendingWaste} ${copy.approvalsWasteUnit}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        tone="warning"
        badge={{ children: String(pendingApprovalsTotal), variant: "warning" }}
        size="sm"
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {pendingCheckouts > 0 ? (
            <Button asChild size="touch" className="w-full sm:w-fit">
              <Link href={routes.checkoutApprovals}>
                <IconClipboardCheck data-icon="inline-start" />
                {copy.checkoutApprovalsTitle}
              </Link>
            </Button>
          ) : null}
          {pendingWaste > 0 ? (
            <Button
              asChild
              size="touch"
              variant="outline"
              className="w-full sm:w-fit"
            >
              <Link href={routes.wasteApprovals}>
                <IconClipboardCheck data-icon="inline-start" />
                {copy.wasteApprovalsTitle}
              </Link>
            </Button>
          ) : null}
        </div>
      </EmployeePanel>
    ) : null;
  const checklistSection = activeWorkStatus ? (
    <EmployeePanel
      icon={state.status === "done" ? IconDone : IconListChecks}
      title={messages.employee.tasks.checklistTitle}
      headerHint={`${state.checklist.done}/${state.checklist.total}`}
      tone={
        state.status === "checkout_pending"
          ? "warning"
          : state.status === "done"
            ? "success"
            : "info"
      }
      contentClassName="gap-3"
      size="sm"
    >
      {checklistContent}
    </EmployeePanel>
  ) : null;

  const isBranchManager = claims.user_role === "branch_manager";

  const managerActionPanel = isBranchManager ? (
    <div className="flex flex-col gap-3">
      <EmployeePanel
        icon={IconClipboardCheck}
        title="Duyệt ca & kho"
        tone="warning"
        size="sm"
      >
        <div className="flex flex-col gap-2">
          {/* Duyệt kết ca */}
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={checkoutApprovalsRoute}>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">Duyệt kết ca</ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  Phê duyệt kết ca của nhân viên
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={pendingCheckouts > 0 ? "warning" : "secondary"}>
                  {pendingCheckouts}
                </Badge>
              </ItemActions>
            </Link>
          </Item>

          {/* Duyệt kiểm kê */}
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={countSlipsRoute}>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">Duyệt kiểm kê</ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  Duyệt chênh lệch phiếu kiểm kê
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={pendingCountSlips > 0 ? "warning" : "secondary"}>
                  {pendingCountSlips}
                </Badge>
              </ItemActions>
            </Link>
          </Item>

          {/* Duyệt nghỉ phép */}
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={leaveApprovalsRoute}>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">Duyệt nghỉ phép</ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  Phê duyệt yêu cầu nghỉ phép
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={pendingLeaveRequests > 0 ? "warning" : "secondary"}>
                  {pendingLeaveRequests}
                </Badge>
              </ItemActions>
            </Link>
          </Item>

          {/* Duyệt hao hụt */}
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={routes.wasteApprovals}>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">Duyệt hao hụt</ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  Duyệt báo cáo hao hụt nguyên liệu
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={pendingWaste > 0 ? "warning" : "secondary"}>
                  {pendingWaste}
                </Badge>
              </ItemActions>
            </Link>
          </Item>
        </div>
      </EmployeePanel>

      <EmployeePanel
        icon={IconUsers}
        title="Nhân sự & Phân công"
        tone="info"
        size="sm"
      >
        <div className="flex flex-col gap-2">
          {/* Đội hôm nay */}
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={teamRoute}>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">Đội hôm nay</ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  Danh sách, ca làm, checklist nhân sự trong ca
                </ItemDescription>
              </ItemContent>
            </Link>
          </Item>

          {/* Nhân sự chi nhánh */}
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={hrRoute}>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">Nhân sự chi nhánh</ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  Xem thông tin nhân viên, ngày công, ngày nghỉ phép
                </ItemDescription>
              </ItemContent>
            </Link>
          </Item>

          {/* Phân công đếm tồn */}
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={countAssignmentsRoute}>
              <ItemContent>
                <ItemTitle className="text-sm font-semibold">Phân công đếm tồn</ItemTitle>
                <ItemDescription className="text-xs text-muted-foreground">
                  Giao việc kiểm đếm nguyên liệu cho nhân sự
                </ItemDescription>
              </ItemContent>
            </Link>
          </Item>
        </div>
      </EmployeePanel>
    </div>
  ) : null;

  const notificationSection = showNotificationControl ? (
    <EmployeePanel tone="info" size="sm">
      <NotificationPopupControl compact />
    </EmployeePanel>
  ) : null;

  const hasClockedIn = Boolean(state.attendance?.checkIn);
  const checkoutDone =
    Boolean(state.attendance?.checkOut) || state.status === "done";
  const checkoutPending = state.status === "checkout_pending";
  const requiredTasksDone = state.checklist.requiredRemaining === 0;
  const tasksDone =
    state.managerAttendanceOnly ||
    (hasClockedIn && (requiredTasksDone || checkoutPending || checkoutDone));
  const tasksActive =
    !state.managerAttendanceOnly &&
    hasClockedIn &&
    state.status === "working" &&
    !requiredTasksDone;
  const checkoutActive =
    hasClockedIn && state.status === "working" && canRequestCheckout(state);
  const checkoutAction = checkoutActive ? (
    <Button asChild size="touch-lg" className={primaryActionClassName}>
      <Link href={routes.clock}>
        <IconLogout data-icon="inline-start" />
        {state.managerAttendanceOnly ? copy.clockOutDirect : copy.clockOut}
      </Link>
    </Button>
  ) : undefined;

  const clockStep: ShiftWorkflowStep = {
    key: "clock-in",
    number: 1,
    icon: IconCamera,
    title: copy.workflowClockInStep,
    description: hasClockedIn ? undefined : title,
    statusLabel: hasClockedIn ? copy.shiftDone : copy.workflowCurrent,
    statusVariant: hasClockedIn ? "success" : "warning",
    tone: hasClockedIn ? "success" : "warning",
    content: hasClockedIn ? undefined : primaryAction,
  };
  const taskStep: ShiftWorkflowStep = {
    key: "tasks",
    number: 2,
    icon: IconListChecks,
    title: copy.workflowTasksStep,
    description: tasksDone
      ? undefined
      : tasksActive
        ? copy.workflowTasksDescription
        : copy.workflowWaiting,
    statusLabel: tasksDone
      ? copy.shiftDone
      : tasksActive
        ? `${state.checklist.requiredRemaining} ${messages.employee.tasks.requiredRemaining}`
        : copy.workflowWaiting,
    statusVariant: tasksDone
      ? "success"
      : tasksActive
        ? "warning"
        : "secondary",
    tone: tasksDone ? "success" : tasksActive ? "info" : "default",
    content: tasksActive ? (
      <>
        {checklistContent}
        {countPanel}
      </>
    ) : undefined,
  };
  const checkoutStep: ShiftWorkflowStep = {
    key: "checkout",
    number: state.managerAttendanceOnly ? 2 : 3,
    icon: IconLogout,
    title: state.managerAttendanceOnly
      ? copy.workflowManagerCheckoutStep
      : copy.workflowCheckoutStep,
    description: checkoutDone
      ? undefined
      : checkoutPending
        ? copy.descriptionCheckoutPending
        : checkoutActive
          ? copy.workflowCheckoutDescription
          : copy.workflowWaiting,
    statusLabel: checkoutDone
      ? copy.shiftDone
      : checkoutPending
        ? copy.checkoutPending
        : checkoutActive
          ? copy.workflowReady
          : copy.workflowWaiting,
    statusVariant: checkoutDone
      ? "success"
      : checkoutPending
        ? "warning"
        : "secondary",
    tone: checkoutDone ? "success" : checkoutPending ? "warning" : "default",
    content: checkoutAction,
  };
  const shiftStepItems = state.managerAttendanceOnly
    ? [clockStep, checkoutStep]
    : [clockStep, taskStep, checkoutStep];
  const workflowSection = <ShiftWorkflowPanel steps={shiftStepItems} />;

  const pageContent =
    mode === "manager-dashboard" ? (
      <div className="flex flex-col gap-3">
        {managerActionPanel}
        {shiftsTodaySection}
        {staleOpenShiftSection}
        {notificationSection}
      </div>
    ) : workflowLayout === "stepper" ? (
      <div className="grid gap-3 lg:grid-cols-5 lg:items-start">
        <div className="lg:sticky lg:top-3 lg:col-span-2">{todayCard}</div>
        <div className="lg:col-span-3 lg:col-start-3 lg:row-span-4 lg:row-start-1 flex flex-col gap-3">
          {workflowSection}
          {isBranchManager ? managerActionPanel : null}
        </div>
        {staleOpenShiftSection ? (
          <div className="lg:col-span-2">{staleOpenShiftSection}</div>
        ) : null}
        {checkoutApprovalsSection ? (
          <div className="lg:col-span-2">{checkoutApprovalsSection}</div>
        ) : null}
        {notificationSection ? (
          <div className="lg:col-span-2">{notificationSection}</div>
        ) : null}
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        {todayCard}
        {shiftsTodaySection}
        {staleOpenShiftSection}
        {checkoutApprovalsSection}
        {isBranchManager ? managerActionPanel : checklistSection}
        {countPanel}
        {notificationSection}
      </div>
    );

  return (
    <EmployeePageShell
      title={copy.title}
      description={copy.description}
      hideHeaderOnMobile
    >
      {pageContent}
    </EmployeePageShell>
  );
}

export default async function EmployeePage() {
  const authState = await loadAuthState();
  return <EmployeeHomePageContent authState={authState} />;
}
