import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarX as IconCalendarX,
  Camera as IconCamera,
  CheckCircle2 as IconDone,
  ClipboardCheck as IconClipboardCheck,
  Clock as IconClock,
  ListChecks as IconListChecks,
  LogOut as IconLogout,
  UserCircle as IconUserCircle,
  WalletCards as IconPayslip,
} from "lucide-react";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import { loadAuthState } from "@/_lib/auth";
import { NotificationPopupControl } from "@/_components/notification-popup-control";
import { messages } from "@lib/messages";
import {
  EmployeeActionSection,
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
import { resolveEmployeeBranchRuntimePath } from "./_lib/branch-runtime-redirect";
import { formatDateVN, formatTimeVN } from "./_lib/vn-business-date";

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
  leave: string;
  payslip: string;
  checkoutApprovals: string;
  count: string;
};

const DEFAULT_HOME_ROUTES: EmployeeHomeRoutes = {
  clock: "/employee/clock",
  tasks: "/employee/tasks",
  schedule: "/employee/schedule",
  profile: "/employee/profile",
  leave: "/employee/leave",
  payslip: "/employee/payslip",
  checkoutApprovals: "/employee/checkout-approvals",
  count: "/employee/count",
};

type EmployeeHomeAuthState = Awaited<ReturnType<typeof loadAuthState>>;

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
  showPersonalActions = false,
  mode = "full",
}: {
  routes?: EmployeeHomeRoutes;
  authState?: EmployeeHomeAuthState;
  showNotificationControl?: boolean;
  showPersonalActions?: boolean;
  mode?: "full" | "today-card";
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
        <div>{primaryAction}</div>
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

  return (
    <EmployeePageShell
      title={copy.title}
      description={copy.description}
      hideHeaderOnMobile
    >
      <div className="flex flex-col gap-3">
        {todayCard}

        {showPersonalActions ? (
          <EmployeeActionSection
            title={messages.employee.profile.personalToolsTitle}
            links={[
              {
                key: "profile",
                href: routes.profile,
                icon: IconUserCircle,
                title: copy.profileTitle,
                description: copy.profileDescription,
              },
              {
                key: "payslip",
                href: routes.payslip,
                icon: IconPayslip,
                title: messages.employee.payslip.title,
                description: copy.payslipLongDescription,
              },
              {
                key: "leave",
                href: routes.leave,
                icon: IconCalendarX,
                title: messages.employee.leave.title,
                description: messages.employee.leave.description,
              },
            ]}
            columns={1}
          />
        ) : null}

        {state.todayShifts.length > 0 ? (
          <EmployeePanel
            icon={IconClock}
            title={copy.shiftsTodayTitle}
            size="sm"
          >
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
                    actions={
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    }
                    className="bg-background"
                  />
                );
              })}
            </div>
          </EmployeePanel>
        ) : null}

        {state.staleOpenShift ? (
          <EmployeePanel
            icon={IconClock}
            title={copy.staleShiftTitle}
            tone="warning"
            size="sm"
          >
            <p className="text-sm text-muted-foreground">
              {copy.staleShiftDescription(
                formatDateVN(state.staleOpenShift.date),
              )}
            </p>
          </EmployeePanel>
        ) : null}

        {pendingCheckouts > 0 ? (
          <EmployeePanel
            icon={IconClipboardCheck}
            title={copy.checkoutApprovalsTitle}
            tone="warning"
            badge={{ children: String(pendingCheckouts), variant: "warning" }}
            size="sm"
          >
            <Button asChild size="touch" className="w-full sm:w-fit">
              <Link href={routes.checkoutApprovals}>
                <IconClipboardCheck data-icon="inline-start" />
                {copy.checkoutApprovalsTitle}
              </Link>
            </Button>
          </EmployeePanel>
        ) : null}

        {countAssignmentCount > 0 ? (
          <EmployeePanel
            icon={IconClipboardCheck}
            title={copy.countTitle}
            tone="info"
            size="sm"
          >
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {copy.countDescription}
              </p>
              <Button asChild size="touch" className="w-full sm:w-fit">
                <Link href={routes.count}>
                  <IconClipboardCheck data-icon="inline-start" />
                  {copy.countCta}
                </Link>
              </Button>
            </div>
          </EmployeePanel>
        ) : null}

        {showNotificationControl ? (
          <EmployeePanel tone="info" size="sm">
            <NotificationPopupControl compact />
          </EmployeePanel>
        ) : null}
      </div>
    </EmployeePageShell>
  );
}

export default async function EmployeePage() {
  const authState = await loadAuthState();
  const { claims } = authState;
  const branchRuntimePath = resolveEmployeeBranchRuntimePath(claims, "home");
  if (branchRuntimePath) {
    redirect(branchRuntimePath);
  }

  return <EmployeeHomePageContent authState={authState} />;
}
