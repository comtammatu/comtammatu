import Link from "next/link";
import {
  Camera as IconCamera,
  ChefHat as IconChefHat,
  CheckCircle2 as IconDone,
  Clock as IconClock,
  ListChecks as IconListChecks,
  LogOut as IconLogout,
  Monitor as IconDeviceDesktop,
  MonitorUp as IconMonitorUp,
  UserCircle as IconUserCircle,
} from "lucide-react";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import { loadAuthState } from "@/_lib/auth";
import { NotificationPushControl } from "@/_components/notification-push-control";
import { messages } from "@lib/messages";
import {
  EmployeeActionSection,
  EmployeePanel,
  EmployeePage as EmployeePageShell,
  EmployeeStatusStrip,
} from "./components/employee-page";
import {
  formatShiftRange,
  getTodayWorkState,
  type TodayWorkState,
  type TodayWorkStatus,
} from "./_lib/today-work-state";
import { formatDateVN, formatTimeVN } from "./_lib/vn-business-date";

const copy = messages.employee.home;

const OPERATION_HANDOFFS: Array<{
  moduleKey: ModuleKey;
  href: (branchId: number) => string;
  icon: typeof IconDeviceDesktop;
  title: string;
  description: string;
}> = [
  {
    moduleKey: "pos",
    href: (branchId: number) => `/br/${branchId}/pos`,
    icon: IconDeviceDesktop,
    title: copy.posTitle,
    description: copy.posDescription,
  },
  {
    moduleKey: "kds",
    href: (branchId: number) => `/br/${branchId}/kds`,
    icon: IconChefHat,
    title: copy.kdsTitle,
    description: copy.kdsDescription,
  },
  {
    moduleKey: "runner",
    href: (branchId: number) => `/br/${branchId}/runner`,
    icon: IconMonitorUp,
    title: copy.runnerTitle,
    description: copy.runnerDescription,
  },
];

function getWorkTone(status: TodayWorkStatus) {
  if (status === "done") return "success" as const;
  if (status === "checkout_pending") return "warning" as const;
  if (
    status === "working" ||
    status === "ready_to_checkout" ||
    status === "not_required"
  ) {
    return "info" as const;
  }
  return "warning" as const;
}

function getWorkTitle(state: TodayWorkState): string {
  const status = state.status;
  if (state.managerAttendanceOnly) {
    if (status === "ready_to_checkout") return copy.managerAttendanceTitle;
    if (status === "done") return copy.statusDone;
    if (status === "not_started") return copy.statusNotStarted;
  }

  if (status === "missing_profile") return copy.statusNoProfile;
  if (status === "missing_branch") return copy.statusNoBranch;
  if (status === "not_required") return copy.statusNotRequired;
  if (status === "not_started") return copy.statusNotStarted;
  if (status === "working") return copy.statusWorking;
  if (status === "ready_to_checkout") return copy.statusReadyToCheckout;
  if (status === "checkout_pending") return copy.statusCheckoutPending;
  return copy.statusDone;
}

function getWorkDescription(state: TodayWorkState): string {
  const status = state.status;
  if (state.managerAttendanceOnly) {
    if (status === "ready_to_checkout") {
      return copy.managerAttendanceDescription;
    }
    if (status === "done") return copy.descriptionDone;
    if (status === "not_started") return copy.descriptionNotStarted;
  }

  if (status === "missing_profile") return copy.descriptionNoProfile;
  if (status === "missing_branch") return copy.descriptionNoBranch;
  if (status === "not_required") return copy.descriptionNotRequired;
  if (status === "not_started") return copy.descriptionNotStarted;
  if (status === "working") return copy.descriptionWorking;
  if (status === "ready_to_checkout") return copy.descriptionReadyToCheckout;
  if (status === "checkout_pending") return copy.descriptionCheckoutPending;
  return copy.descriptionDone;
}

export default async function EmployeePage() {
  const { supabase, claims } = await loadAuthState();
  const state = await getTodayWorkState();
  const branchId = state.branchId;

  let branchIsHq = false;
  if (branchId) {
    const { data } = await supabase
      .from("branches")
      .select("branch_kind")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchIsHq =
      data?.branch_kind === "central_warehouse" ||
      data?.branch_kind === "central_kitchen";
  }

  const operationHandoffs =
    state.status === "working" &&
    branchId &&
    !branchIsHq &&
    state.attendance?.checkIn &&
    !state.attendance.checkOut &&
    !state.attendance.checkoutRequestedAt
      ? OPERATION_HANDOFFS.filter((item) =>
          canAccess(claims.user_role, item.moduleKey),
        ).map((item) => ({
          ...item,
          href: item.href(branchId),
        }))
      : [];

  const tone = getWorkTone(state.status);
  const title = getWorkTitle(state);
  const description = getWorkDescription(state);
  const currentShiftName =
    state.attendance?.shiftName ??
    (state.nextShift?.date === state.today ? state.nextShift.shiftName : null);
  const currentShiftRange = state.attendance?.shiftStartTime
    ? `${state.attendance.shiftStartTime.slice(0, 5)} - ${state.attendance.shiftEndTime?.slice(0, 5) ?? "—"}`
    : state.nextShift?.date === state.today
      ? formatShiftRange(state.nextShift)
      : "—";

  const progressValue = state.managerAttendanceOnly
    ? state.attendance?.checkOut
      ? 100
      : state.attendance?.checkIn
        ? 50
        : 0
    : state.status === "done" ||
        state.status === "ready_to_checkout" ||
        state.status === "checkout_pending"
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
  const primaryActionClassName =
    "w-full motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 sm:w-fit sm:min-w-44";
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
        <Link href="/employee/profile">
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
        <Link href="/employee/profile">
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
        <Link href="/employee/schedule">
          <IconClock data-icon="inline-start" />
          {copy.viewSchedule}
        </Link>
      </Button>
    ) : state.status === "not_started" ? (
      <Button asChild size="touch-lg" className={primaryActionClassName}>
        <Link href="/employee/clock">
          <IconCamera data-icon="inline-start" />
          {copy.clockIn}
        </Link>
      </Button>
    ) : state.status === "working" ? (
      <Button asChild size="touch-lg" className={primaryActionClassName}>
        <Link href="/employee/tasks">
          <IconListChecks data-icon="inline-start" />
          {copy.shiftTasks}
        </Link>
      </Button>
    ) : state.status === "ready_to_checkout" ? (
      <Button asChild size="touch-lg" className={primaryActionClassName}>
        <Link href="/employee/clock">
          <IconLogout data-icon="inline-start" />
          {state.managerAttendanceOnly ? copy.clockOutDirect : copy.clockOut}
        </Link>
      </Button>
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

  return (
    <EmployeePageShell
      title={copy.title}
      description={copy.description}
      hideHeaderOnMobile
    >
      <div className="flex flex-col gap-3">
        <EmployeePanel tone={tone} size="sm" contentClassName="gap-3">
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-heading text-xl font-semibold tracking-tight">
                  {title}
                </p>
                <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                  {todayMeta}
                </p>
                <p className="mt-2 text-2xs font-semibold uppercase text-muted-foreground">
                  {copy.nextActionTitle}
                </p>
                <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-muted-foreground sm:block">
                  {description}
                </p>
              </div>
              <Badge variant={progressBadgeVariant} className="shrink-0">
                {progressValue}%
              </Badge>
            </div>
            <div>{primaryAction}</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-muted-foreground">
                  {copy.workProgress}
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {progressHint}
                </span>
              </div>
              <Progress
                value={progressValue}
                tone={progressTone}
                className="h-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
              />
            </div>
            <EmployeeStatusStrip items={todaySummaryItems} />
          </div>
        </EmployeePanel>

        <EmployeeActionSection
          title={copy.operationToolsTitle}
          links={operationHandoffs.map((link) => ({
            key: link.moduleKey,
            href: link.href,
            icon: link.icon,
            title: link.title,
            description: link.description,
          }))}
          columns={2}
        />

        <EmployeePanel tone="info" size="sm">
          <NotificationPushControl compact />
        </EmployeePanel>
      </div>
    </EmployeePageShell>
  );
}
