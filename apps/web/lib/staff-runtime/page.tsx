/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: manager shift action panel keeps operational copy inline */
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays as IconCalendar,
  CalendarX2 as IconLeave,
  Camera as IconCamera,
  CheckCircle2 as IconDone,
  ClipboardCheck as IconClipboardCheck,
  Clock as IconClock,
  ListChecks as IconListChecks,
  LogOut as IconLogout,
  Briefcase as IconBriefcase,
  ReceiptText as IconPayslip,
  UserCircle as IconUserCircle,
} from "lucide-react";
import {
  PERMISSION_KEYS,
  canSubscribeBranchOpsTopic,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { formatPercent } from "@comtammatu/shared/format";
import { formatVNClockTime } from "@comtammatu/shared/time";
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
import { BranchOpsRefresh } from "@/_components/branch-ops-refresh";
import { NotificationPopupControl } from "@/_components/notification-popup-control";
import { messages } from "@lib/messages";
import { workCopy } from "@lib/messages/work";
import {
  EmployeeActionSection,
  EmployeeControlBar,
  EmployeeInlineState,
  EmployeePanel,
  EmployeePage as EmployeePageShell,
  EmployeeStatusStrip,
} from "./components/staff-runtime-page";
import {
  BranchOperatorActionSection,
  BranchOperatorControlBar,
  BranchOperatorInlineState,
  BranchOperatorPanel,
  BranchOperatorPage as BranchOperatorPageShell,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  getTodayWorkState,
  type TodayShiftEntry,
  type TodayWorkState,
  type TodayWorkStatus,
} from "./_lib/today-work-state";
import { formatDateVN, formatTimeVN } from "./_lib/vn-business-date";
import { AppEmptyState } from "@/components/surface";
import { TasksClient } from "./tasks/tasks-client";
import { StaffCountPanelContent } from "./count/page";

type WorkdayTone = "default" | "success" | "warning" | "info" | "destructive";

type WorkdayCopy = {
  title: string;
  description: string;
  statusWorking: string;
  statusCheckoutPending: string;
  statusNotRequired: string;
  statusDone: string;
  statusNotStarted: string;
  statusNoProfile: string;
  statusNoBranch: string;
  descriptionCheckoutPending: string;
  descriptionNotRequired: string;
  descriptionShiftUnassigned: string;
  checkInShort: string;
  checkOutShort: string;
  clockIn: string;
  clockOut: string;
  clockOutDirect: string;
  checkoutPending: string;
  completed: string;
  shiftTasks: string;
  tasksShort: string;
  managerAttendanceTitle: string;
  managerProgressInShift: string;
  workProgress: string;
  notYet: string;
  workflowTitle: string;
  workflowStep: (step: number) => string;
  workflowCurrent: string;
  workflowWaiting: string;
  workflowReady: string;
  workflowClockInStep: string;
  workflowTasksStep: string;
  workflowTasksDescription: string;
  workflowCheckoutStep: string;
  workflowManagerCheckoutStep: string;
  workflowCheckoutDescription: string;
  viewSchedule: string;
  profileTitle: string;
  checkoutApprovalsTitle: string;
  approvalsQueueTitle: string;
  approvalsCheckoutUnit: string;
  approvalsWasteUnit: string;
  wasteApprovalsTitle: string;
  staleShiftTitle: string;
  staleShiftDescription: (date: string) => string;
  shiftsTodayTitle: string;
  shiftDone: string;
  shiftWorking: string;
  shiftPending: string;
  shiftNotStarted: string;
};

type WorkdayTasksCopy = {
  checklistTitle: string;
  noChecklistTitle: string;
  noChecklistDescription: string;
  requiredRemaining: string;
};

type WorkdayPageComponent = (props: {
  title: string;
  description?: string;
  hideHeaderOnMobile?: boolean;
  badge?: { children: ReactNode; variant?: BadgeProps["variant"] };
  action?: ReactNode;
  children: ReactNode;
}) => ReactNode;

type WorkdayPanelComponent = (props: {
  title?: string;
  description?: string;
  headerHint?: ReactNode;
  icon?: ElementType;
  tone?: WorkdayTone;
  badge?: { children: ReactNode; variant?: BadgeProps["variant"] };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "default" | "sm";
}) => ReactNode;

type WorkdayInlineStateComponent = (props: {
  icon?: ElementType;
  media?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: Exclude<WorkdayTone, "destructive">;
  className?: string;
  mediaClassName?: string;
}) => ReactNode;

type WorkdayControlBarComponent = (props: {
  children: ReactNode;
  className?: string;
}) => ReactNode;

type WorkdayStatusStripComponent = (props: {
  items: Array<{
    label: string;
    value: ReactNode;
    muted?: boolean;
    mono?: boolean;
  }>;
  className?: string;
}) => ReactNode;

type WorkdayActionSectionComponent = (props: {
  links: Array<{
    key: string;
    href: string;
    icon?: ElementType;
    title: string;
  }>;
  columns?: 1 | 2;
  mobileColumns?: 1 | 2;
  size?: "default" | "sm";
}) => ReactNode;

type WorkdayRenderPrimitives = {
  PageShell: WorkdayPageComponent;
  Panel: WorkdayPanelComponent;
  InlineState: WorkdayInlineStateComponent;
  ControlBar: WorkdayControlBarComponent;
  StatusStrip: WorkdayStatusStripComponent;
  ActionSection: WorkdayActionSectionComponent;
};

type WorkdayPlane = "employee" | "branch";

const EMPLOYEE_WORKDAY_PRIMITIVES: WorkdayRenderPrimitives = {
  PageShell: EmployeePageShell,
  Panel: EmployeePanel,
  InlineState: EmployeeInlineState,
  ControlBar: EmployeeControlBar,
  StatusStrip: EmployeeStatusStrip,
  ActionSection: EmployeeActionSection,
};

const BRANCH_WORKDAY_PRIMITIVES: WorkdayRenderPrimitives = {
  PageShell: BranchOperatorPageShell,
  Panel: BranchOperatorPanel,
  InlineState: BranchOperatorInlineState,
  ControlBar: BranchOperatorControlBar,
  StatusStrip: BranchOperatorStatusStrip,
  ActionSection: BranchOperatorActionSection,
};

const employeeWorkdayCopy: WorkdayCopy = messages.employee.home;
const employeeWorkdayTasksCopy: WorkdayTasksCopy = messages.employee.tasks;

function assignmentCellKey(row: {
  location_id: number;
  ingredient_id: number;
}) {
  return `${row.location_id}:${row.ingredient_id}`;
}

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
  leave: string;
  payslip: string;
  profile: string;
  checkoutApprovals: string;
  count: string;
  wasteApprovals: string;
  team?: string;
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

function ShiftWorkflowPanel({
  steps,
  copy,
  Panel,
  InlineState,
}: {
  steps: ShiftWorkflowStep[];
  copy: WorkdayCopy;
  Panel: WorkdayPanelComponent;
  InlineState: WorkdayInlineStateComponent;
}) {
  return (
    <Panel
      icon={IconListChecks}
      title={copy.workflowTitle}
      contentClassName="gap-2"
      size="sm"
    >
      <div className="flex flex-col gap-2">
        {steps.map((step) => {
          const hasContent = Boolean(step.content);
          return (
            <InlineState
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
            </InlineState>
          );
        })}
      </div>
    </Panel>
  );
}

function getShiftStateBadge(
  shift: TodayShiftEntry,
  copy: WorkdayCopy,
): {
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

function getWorkTitle(state: TodayWorkState, copy: WorkdayCopy): string {
  const status = state.status;
  if (state.managerAttendanceOnly) {
    if (status === "working") return copy.managerAttendanceTitle;
    if (status === "done") return copy.statusDone;
    if (status === "not_started") return copy.statusNotStarted;
  }

  if (status === "missing_profile") return copy.statusNoProfile;
  if (status === "missing_branch") return copy.statusNoBranch;
  if (status === "not_required") return copy.statusNotRequired;
  if (status === "not_started" && state.shiftUnassigned) {
    return copy.descriptionShiftUnassigned;
  }
  if (status === "not_started") return copy.statusNotStarted;
  if (status === "working") return copy.statusWorking;
  if (status === "checkout_pending") return copy.statusCheckoutPending;
  return copy.statusDone;
}

export type StaffWorkdayPageContentProps = {
  routes: EmployeeHomeRoutes;
  authState?: EmployeeHomeAuthState;
  showNotificationControl?: boolean;
  enableBranchOpsRefresh?: boolean;
  mode?: "full" | "today-card" | "compact-status" | "manager-dashboard";
  workflowLayout?: EmployeeHomeWorkflowLayout;
  plane?: WorkdayPlane;
  copy?: WorkdayCopy;
  tasksCopy?: WorkdayTasksCopy;
};

export async function StaffWorkdayPageContent({
  routes,
  authState,
  showNotificationControl = true,
  enableBranchOpsRefresh = true,
  mode = "full",
  workflowLayout = "standard",
  plane = "employee",
  copy = employeeWorkdayCopy,
  tasksCopy = employeeWorkdayTasksCopy,
}: StaffWorkdayPageContentProps) {
  const primitives =
    plane === "branch"
      ? BRANCH_WORKDAY_PRIMITIVES
      : EMPLOYEE_WORKDAY_PRIMITIVES;
  const {
    PageShell,
    Panel,
    InlineState,
    ControlBar,
    StatusStrip,
    ActionSection,
  } = primitives;
  const { supabase, claims, session } = authState ?? (await loadAuthState());
  const { data: canAccessWork } = await supabase.rpc("can_access_workspace");
  const state = await getTodayWorkState();

  // Checkout requests BLOCK the requesting employee until a manager
  // approves — the count surfaces the queue on the screen managers
  // already open, instead of three taps deep behind Profile.
  let pendingCheckouts = 0;
  if (CHECKOUT_APPROVER_ROLES.includes(claims.user_role)) {
    const approvalBranchId = claims.branch_id ?? state.branchId;
    const permissionPromise =
      typeof approvalBranchId === "number"
        ? supabase.rpc("has_permission", {
            p_branch_id: approvalBranchId,
            p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
          })
        : Promise.resolve({ data: false });
    const countPromise =
      typeof approvalBranchId === "number"
        ? supabase.rpc("get_checkout_review_queue", {
            p_branch_id: approvalBranchId,
            p_include_rows: false,
          })
        : Promise.resolve({ data: [] });
    const [permissionResult, countResult] = await Promise.all([
      permissionPromise,
      countPromise,
    ]);
    if (permissionResult.data === true) {
      pendingCheckouts = countResult.data?.[0]?.pending_count ?? 0;
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

  let pendingCountSlips = 0;
  if (claims.user_role === "branch_manager" || claims.user_role === "owner") {
    const service = createServiceClient();
    const branchIdFilter = claims.branch_id ?? -1;

    const countPermissionResult =
      typeof claims.branch_id === "number"
        ? await supabase.rpc("has_permission", {
            p_branch_id: claims.branch_id,
            p_key: PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
          })
        : await supabase.rpc("has_permission_any", {
            p_key: PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
          });

    if (countPermissionResult.data === true) {
      const countCountResult = await service
        .from("inventory_count_slips")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", branchIdFilter)
        .eq("status", "submitted");
      pendingCountSlips = countCountResult.count ?? 0;
    }
  }

  // Surface the count-slip task only when this employee actually has active
  // assignments — RLS + the inner-join on profile_id keep it to their own rows
  // (a manager who can read branch-wide assignments still only sees their own).
  let countAssignmentCount = 0;
  if (session?.user?.id) {
    const service = createServiceClient();
    const currentShiftId =
      state.todayShifts.find((shift) => shift.isCurrent)?.shiftId ?? null;
    const countBranchId = state.attendance?.branchId ?? state.branchId;
    let countAssignmentQuery = service
      .from("inventory_count_assignments")
      .select(
        "location_id, ingredient_id, shift_id, employees!inner(profile_id)",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .eq("employees.profile_id", session.user.id);
    if (countBranchId !== null) {
      countAssignmentQuery = countAssignmentQuery.eq(
        "branch_id",
        countBranchId,
      );
    }
    countAssignmentQuery =
      currentShiftId === null
        ? countAssignmentQuery.is("shift_id", null)
        : countAssignmentQuery.or(
            `shift_id.is.null,shift_id.eq.${currentShiftId}`,
          );
    const { data: countAssignments } = await countAssignmentQuery;
    const shiftSpecificCells = new Set<string>();
    if (currentShiftId !== null && countBranchId !== null) {
      const { data: shiftSpecificAssignments } = await service
        .from("inventory_count_assignments")
        .select("location_id, ingredient_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", countBranchId)
        .eq("shift_id", currentShiftId)
        .eq("is_active", true);
      for (const row of shiftSpecificAssignments ?? []) {
        shiftSpecificCells.add(assignmentCellKey(row));
      }
    }
    countAssignmentCount = (countAssignments ?? []).filter(
      (row) =>
        row.shift_id !== null ||
        !shiftSpecificCells.has(assignmentCellKey(row)),
    ).length;
  }
  const activeBranchId = claims.branch_id ?? -1;
  const teamRoute = routes.team ?? `/br/${activeBranchId}/team`;

  const tone = getWorkTone(state.status);
  const title = getWorkTitle(state, copy);
  const currentShiftName = state.attendance?.shiftName ?? null;
  const currentShiftRange = state.attendance?.shiftStartTime
    ? `${formatVNClockTime(state.attendance.shiftStartTime)} - ${formatVNClockTime(state.attendance.shiftEndTime)}`
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
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
        render={<Link href={routes.profile} />}
      >
        <IconUserCircle data-icon="inline-start" />
        {copy.profileTitle}
      </Button>
    ) : state.status === "missing_branch" ? (
      <Button
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
        render={<Link href={routes.profile} />}
      >
        <IconUserCircle data-icon="inline-start" />
        {copy.profileTitle}
      </Button>
    ) : state.status === "not_required" ? (
      <Button
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
        render={<Link href={routes.schedule} />}
      >
        <IconClock data-icon="inline-start" />
        {copy.viewSchedule}
      </Button>
    ) : state.status === "not_started" && state.shiftUnassigned ? (
      <Button
        variant="outline"
        size="touch-lg"
        className={primaryActionClassName}
        disabled
      >
        <IconClock data-icon="inline-start" />
        {copy.clockIn}
      </Button>
    ) : state.status === "not_started" ? (
      <Button
        size="touch-lg"
        className={primaryActionClassName}
        render={<Link href={routes.clock} />}
      >
        <IconCamera data-icon="inline-start" />
        {copy.clockIn}
      </Button>
    ) : state.status === "working" ? (
      canRequestCheckout(state) ? (
        <Button
          size="touch-lg"
          className={primaryActionClassName}
          render={<Link href={routes.clock} />}
        >
          <IconLogout data-icon="inline-start" />
          {state.managerAttendanceOnly ? copy.clockOutDirect : copy.clockOut}
        </Button>
      ) : (
        <Button
          size="touch-lg"
          className={primaryActionClassName}
          render={<Link href={routes.tasks} />}
        >
          <IconListChecks data-icon="inline-start" />
          {copy.shiftTasks}
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
    <Panel tone={tone} size="sm" contentClassName="gap-3">
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
            {formatPercent(progressValue, 0)}
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
        <StatusStrip items={todaySummaryItems} />
      </div>
    </Panel>
  );

  if (mode === "today-card") return todayCard;

  if (mode === "compact-status") {
    const compactCta =
      state.status === "not_started" ? (
        <Button size="touch" render={<Link href={routes.clock} />}>
          <IconCamera data-icon="inline-start" />
          {copy.clockIn}
        </Button>
      ) : null;

    return (
      <ControlBar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{todayMeta}</p>
        </div>
        {compactCta}
      </ControlBar>
    );
  }

  const activeWorkStatus =
    state.status === "working" ||
    state.status === "checkout_pending" ||
    state.status === "done";
  const countPanel =
    countAssignmentCount > 0 && activeWorkStatus ? (
      <div id="shift-inventory-count" className="flex flex-col gap-3">
        <StaffCountPanelContent
          searchParams={Promise.resolve({})}
          routeBranchId={state.branchId ?? undefined}
          baseHref={routes.tasks}
          profileHref={routes.profile}
          plane={plane}
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
        hideCountTask={Boolean(countPanel)}
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
        title={tasksCopy.noChecklistTitle}
        description={tasksCopy.noChecklistDescription}
        icon={<IconListChecks />}
      />
    );
  const shiftsTodaySection =
    state.todayShifts.length > 0 ? (
      <Panel icon={IconClock} title={copy.shiftsTodayTitle} size="sm">
        <div className="flex flex-col gap-2">
          {state.todayShifts.map((shift) => {
            const badge = getShiftStateBadge(shift, copy);
            const shiftTimeRange = `${shift.checkIn ? formatTimeVN(shift.checkIn) : "—"} - ${
              shift.checkOut ? formatTimeVN(shift.checkOut) : "—"
            }`;
            return (
              <InlineState
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
      </Panel>
    ) : null;
  const staleOpenShiftSection = state.staleOpenShift ? (
    <Panel
      icon={IconClock}
      title={copy.staleShiftTitle}
      tone="warning"
      size="sm"
    >
      <p className="text-sm text-muted-foreground">
        {copy.staleShiftDescription(formatDateVN(state.staleOpenShift.date))}
      </p>
    </Panel>
  ) : null;
  const pendingApprovalsTotal = pendingCheckouts + pendingWaste;
  const checkoutApprovalsSection =
    pendingApprovalsTotal > 0 ? (
      <Panel
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
            <Button
              size="touch"
              className="w-full sm:w-fit"
              render={<Link href={routes.checkoutApprovals} />}
            >
              <IconClipboardCheck data-icon="inline-start" />
              {copy.checkoutApprovalsTitle}
            </Button>
          ) : null}
          {pendingWaste > 0 ? (
            <Button
              size="touch"
              variant="outline"
              className="w-full sm:w-fit"
              render={<Link href={routes.wasteApprovals} />}
            >
              <IconClipboardCheck data-icon="inline-start" />
              {copy.wasteApprovalsTitle}
            </Button>
          ) : null}
        </div>
      </Panel>
    ) : null;
  const checklistSection = activeWorkStatus ? (
    <Panel
      icon={state.status === "done" ? IconDone : IconListChecks}
      title={tasksCopy.checklistTitle}
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
    </Panel>
  ) : null;

  const isBranchManager = claims.user_role === "branch_manager";

  const managerPendingTotal =
    pendingCheckouts + pendingCountSlips + pendingWaste;
  const managerActionPanel = isBranchManager ? (
    <Item
      variant="outline"
      size="sm"
      className="bg-card"
      render={<Link href={teamRoute} />}
    >
      <ItemContent>
        <ItemTitle size="heading">Quản lý đội chi nhánh</ItemTitle>
        <ItemDescription className="text-xs text-muted-foreground">
          Mở màn hình đội để duyệt ca, kho, nhân sự và phân công.
        </ItemDescription>
      </ItemContent>
      {managerPendingTotal > 0 ? (
        <ItemActions>
          <Badge variant="warning">{managerPendingTotal}</Badge>
        </ItemActions>
      ) : null}
    </Item>
  ) : null;

  const notificationSection = showNotificationControl ? (
    <Panel tone="info" size="sm">
      <NotificationPopupControl compact />
    </Panel>
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
    <Button
      size="touch-lg"
      className={primaryActionClassName}
      render={<Link href={routes.clock} />}
    >
      <IconLogout data-icon="inline-start" />
      {state.managerAttendanceOnly ? copy.clockOutDirect : copy.clockOut}
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
        ? `${state.checklist.requiredRemaining} ${tasksCopy.requiredRemaining}`
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
  const workflowSection = (
    <ShiftWorkflowPanel
      steps={shiftStepItems}
      copy={copy}
      Panel={Panel}
      InlineState={InlineState}
    />
  );
  const personalShortcutsSection = (
    <ActionSection
      links={[
        {
          key: "schedule",
          href: routes.schedule,
          icon: IconCalendar,
          title: messages.employee.home.scheduleTitle,
        },
        {
          key: "leave",
          href: routes.leave,
          icon: IconLeave,
          title: messages.employee.home.leaveTitle,
        },
        {
          key: "payslip",
          href: routes.payslip,
          icon: IconPayslip,
          title: messages.employee.home.payslipTitle,
        },
      ]}
      columns={1}
      mobileColumns={1}
      size="sm"
    />
  );

  const workCtaSection =
    canAccessWork === true ? (
      <Panel tone="info" size="sm">
        <Button
          size="touch-lg"
          className="w-full sm:w-fit"
          render={<Link href="/work" />}
        >
          <IconBriefcase data-icon="inline-start" />
          {workCopy.openWorkCta}
        </Button>
      </Panel>
    ) : null;

  const pageContent =
    mode === "manager-dashboard" ? (
      <div className="flex flex-col gap-3">
        {todayCard}
        {managerActionPanel}
        {shiftsTodaySection}
        {staleOpenShiftSection}
        {notificationSection}
      </div>
    ) : workflowLayout === "stepper" ? (
      <div className="grid gap-3 lg:grid-cols-5 lg:items-start">
        <div className="lg:sticky lg:top-3 lg:col-span-2">{todayCard}</div>
        <div className="lg:col-span-3 lg:col-start-3 lg:row-span-4 lg:row-start-1 flex flex-col gap-3">
          {workCtaSection}
          {workflowSection}
          {personalShortcutsSection}
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
        {workCtaSection}
        {shiftsTodaySection}
        {staleOpenShiftSection}
        {checkoutApprovalsSection}
        {isBranchManager ? null : checklistSection}
        {countPanel}
        {personalShortcutsSection}
        {isBranchManager ? managerActionPanel : null}
        {notificationSection}
      </div>
    );

  return (
    <PageShell
      title={copy.title}
      description={copy.description}
      hideHeaderOnMobile
    >
      {enableBranchOpsRefresh &&
      state.branchId !== null &&
      canSubscribeBranchOpsTopic(claims, state.branchId) ? (
        <BranchOpsRefresh branchId={state.branchId} />
      ) : null}
      {pageContent}
    </PageShell>
  );
}
