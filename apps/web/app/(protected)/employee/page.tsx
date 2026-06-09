import Link from "next/link";
import type { ReactNode } from "react";
import {
  Camera as IconCamera,
  ChefHat as IconChefHat,
  CheckCircle2 as IconDone,
  ClipboardCheck as IconClipboardCheck,
  Clock as IconClock,
  ListChecks as IconListChecks,
  LogOut as IconLogout,
  MessageSquare as IconMessageSquare,
  Monitor as IconDeviceDesktop,
  MonitorUp as IconMonitorUp,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  SlidersHorizontal as IconSlidersHorizontal,
  Utensils as IconUtensils,
  UserCircle as IconUserCircle,
  type LucideIcon,
} from "lucide-react";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Progress } from "@comtammatu/ui/components/progress";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  EmployeeActionSection,
  EmployeeDashboardGrid,
  EmployeePanel,
  EmployeePage as EmployeePageShell,
} from "./components/employee-page";
import {
  formatShiftRange,
  getTodayWorkState,
  type TodayWorkState,
  type TodayWorkStatus,
} from "./_lib/today-work-state";
import { formatDateVN, formatTimeVN } from "./_lib/vn-business-date";

const copy = messages.employee.home;

type WorkStepState = "active" | "done" | "pending" | "skipped" | "waiting";

interface WorkStep {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  state: WorkStepState;
}

const WORK_STEP_BADGE_VARIANT = {
  active: "info",
  done: "success",
  pending: "warning",
  skipped: "secondary",
  waiting: "outline",
} satisfies Record<WorkStepState, BadgeProps["variant"]>;

const WORK_STEP_ICON_CLASSNAME = {
  active: "text-info",
  done: "text-success",
  pending: "text-warning",
  skipped: "text-muted-foreground",
  waiting: "text-muted-foreground",
} satisfies Record<WorkStepState, string>;

const WORK_STEP_ITEM_CLASSNAME = {
  active: "border-info/40 bg-info/5",
  done: "border-success/40 bg-success/5",
  pending: "border-warning/40 bg-warning/5",
  skipped: "bg-muted/30",
  waiting: "",
} satisfies Record<WorkStepState, string>;

const WORK_STEP_LABEL = {
  active: copy.workflowStepActive,
  done: copy.workflowStepDone,
  pending: copy.workflowStepPending,
  skipped: copy.workflowStepSkipped,
  waiting: copy.workflowStepWaiting,
} satisfies Record<WorkStepState, string>;

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

const MANAGER_BRANCH_TOOLS: Array<{
  moduleKey: ModuleKey;
  href: (branchId: number) => string;
  icon: typeof IconDeviceDesktop;
  title: string;
  description: string;
}> = [
  {
    moduleKey: "employee_checkout_approvals",
    href: () => "/employee/checkout-approvals",
    icon: IconClipboardCheck,
    title: copy.managerCheckoutApprovalsTitle,
    description: copy.managerCheckoutApprovalsDescription,
  },
  {
    moduleKey: "pos",
    href: (branchId: number) => `/br/${branchId}/pos`,
    icon: IconDeviceDesktop,
    title: copy.posTitle,
    description: copy.managerPosDescription,
  },
  {
    moduleKey: "orders",
    href: () => "/orders",
    icon: IconReceipt,
    title: copy.managerOrdersTitle,
    description: copy.managerOrdersDescription,
  },
  {
    moduleKey: "kds",
    href: (branchId: number) => `/br/${branchId}/kds`,
    icon: IconChefHat,
    title: copy.kdsTitle,
    description: copy.managerKdsDescription,
  },
  {
    moduleKey: "runner",
    href: (branchId: number) => `/br/${branchId}/runner`,
    icon: IconMonitorUp,
    title: copy.runnerTitle,
    description: copy.managerRunnerDescription,
  },
  {
    moduleKey: "branch_menu_limits",
    href: (branchId: number) => `/br/${branchId}/menu-limits`,
    icon: IconSlidersHorizontal,
    title: copy.managerMenuLimitsTitle,
    description: copy.managerMenuLimitsDescription,
  },
  {
    moduleKey: "branch_settings",
    href: (branchId: number) => `/br/${branchId}/settings`,
    icon: IconSettings,
    title: copy.managerBranchSettingsTitle,
    description: copy.managerBranchSettingsDescription,
  },
];

const MANAGER_WORKSPACE_TOOLS: Array<{
  moduleKey: ModuleKey;
  href: () => string;
  icon: typeof IconDeviceDesktop;
  title: string;
  description: string;
}> = [
  {
    moduleKey: "inventory",
    href: () => "/inventory",
    icon: IconPackage,
    title: copy.managerInventoryTitle,
    description: copy.managerInventoryDescription,
  },
  {
    moduleKey: "menu",
    href: () => "/menu",
    icon: IconUtensils,
    title: copy.managerMenuTitle,
    description: copy.managerMenuDescription,
  },
  {
    moduleKey: "feedback",
    href: () => "/admin/feedback",
    icon: IconMessageSquare,
    title: copy.managerFeedbackTitle,
    description: copy.managerFeedbackDescription,
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

function getWorkTitle(status: TodayWorkStatus): string {
  if (status === "missing_profile") return copy.statusNoProfile;
  if (status === "missing_branch") return copy.statusNoBranch;
  if (status === "not_required") return copy.statusNotRequired;
  if (status === "not_started") return copy.statusNotStarted;
  if (status === "working") return copy.statusWorking;
  if (status === "ready_to_checkout") return copy.statusReadyToCheckout;
  if (status === "checkout_pending") return copy.statusCheckoutPending;
  return copy.statusDone;
}

function getWorkDescription(status: TodayWorkStatus): string {
  if (status === "missing_profile") return copy.descriptionNoProfile;
  if (status === "missing_branch") return copy.descriptionNoBranch;
  if (status === "not_required") return copy.descriptionNotRequired;
  if (status === "not_started") return copy.descriptionNotStarted;
  if (status === "working") return copy.descriptionWorking;
  if (status === "ready_to_checkout") return copy.descriptionReadyToCheckout;
  if (status === "checkout_pending") return copy.descriptionCheckoutPending;
  return copy.descriptionDone;
}

function getStepState(
  state: TodayWorkState,
  step: "clock_in" | "tasks" | "checkout",
): WorkStepState {
  if (state.status === "not_required") return "skipped";

  const hasCheckIn = Boolean(state.attendance?.checkIn);
  const hasCheckOut = Boolean(state.attendance?.checkOut);

  if (step === "clock_in") {
    if (hasCheckIn) return "done";
    if (
      state.status === "missing_profile" ||
      state.status === "missing_branch" ||
      state.status === "not_started"
    ) {
      return "active";
    }
    return "waiting";
  }

  if (step === "tasks") {
    if (!hasCheckIn) return "waiting";
    if (
      state.status === "ready_to_checkout" ||
      state.status === "checkout_pending" ||
      state.status === "done"
    ) {
      return "done";
    }
    return state.status === "working" ? "active" : "waiting";
  }

  if (hasCheckOut) return "done";
  if (state.status === "checkout_pending") return "pending";
  if (state.status === "ready_to_checkout") return "active";
  return "waiting";
}

function getWorkflowSteps(state: TodayWorkState): WorkStep[] {
  return [
    {
      key: "clock-in",
      title: copy.clockIn,
      description: copy.workflowClockInDescription,
      icon: IconCamera,
      state: getStepState(state, "clock_in"),
    },
    {
      key: "tasks",
      title: copy.shiftTasks,
      description: copy.workflowTasksDescription,
      icon: IconListChecks,
      state: getStepState(state, "tasks"),
    },
    {
      key: "checkout",
      title: copy.clockOut,
      description: copy.workflowCheckoutDescription,
      icon: IconLogout,
      state: getStepState(state, "checkout"),
    },
  ];
}

interface TodayMetric {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  muted?: boolean;
  mono?: boolean;
  progress?: {
    value: number;
    tone: "default" | "success" | "warning" | "destructive";
  };
}

function TodayMetricGrid({ rows }: { rows: TodayMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/30 p-3"
        >
          <span className="text-xs text-muted-foreground">{row.label}</span>
          <span
            className={cn(
              "min-w-0 truncate text-sm font-medium",
              row.mono && "font-mono tabular-nums",
              row.muted ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {row.value}
          </span>
          {row.progress ? (
            <Progress
              value={row.progress.value}
              tone={row.progress.tone}
              className="h-1.5"
            />
          ) : null}
          {row.hint ? (
            <span className="truncate text-xs text-muted-foreground">
              {row.hint}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WorkStepList({ steps }: { steps: WorkStep[] }) {
  return (
    <div className="flex flex-col gap-2" aria-label={copy.workflowTitle}>
      <p className="font-heading text-sm font-semibold">{copy.workflowTitle}</p>
      <ItemGroup className="grid gap-2 md:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Item
              key={step.key}
              variant="outline"
              size="sm"
              className={cn(
                "items-start sm:flex-nowrap",
                WORK_STEP_ITEM_CLASSNAME[step.state],
              )}
            >
              <ItemMedia
                variant="icon"
                className={WORK_STEP_ICON_CLASSNAME[step.state]}
              >
                <Icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{step.title}</ItemTitle>
                <ItemDescription>{step.description}</ItemDescription>
              </ItemContent>
              <ItemActions className="ml-auto">
                <Badge variant={WORK_STEP_BADGE_VARIANT[step.state]}>
                  {WORK_STEP_LABEL[step.state]}
                </Badge>
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </div>
  );
}

export default async function EmployeePage() {
  const { supabase, claims } = await loadAuthState();
  const state = await getTodayWorkState();
  const branchId = state.branchId;
  const effectiveBranchId = branchId ?? claims.branch_id;
  const isBranchManager = claims.user_role === "branch_manager";

  let branchIsHq = false;
  if (effectiveBranchId) {
    const { data } = await supabase
      .from("branches")
      .select("branch_kind")
      .eq("id", effectiveBranchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchIsHq =
      data?.branch_kind === "central_warehouse" ||
      data?.branch_kind === "central_kitchen";
  }

  const operationHandoffs =
    !isBranchManager &&
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

  const managerTools =
    isBranchManager && effectiveBranchId && !branchIsHq
      ? [...MANAGER_BRANCH_TOOLS, ...MANAGER_WORKSPACE_TOOLS]
          .filter((item) => canAccess(claims.user_role, item.moduleKey))
          .map((item) => ({
            ...item,
            href: item.href(effectiveBranchId),
          }))
      : [];

  const tone = getWorkTone(state.status);
  const title = getWorkTitle(state.status);
  const description = getWorkDescription(state.status);
  const workflowSteps = getWorkflowSteps(state);
  const currentShiftName =
    state.attendance?.shiftName ??
    (state.nextShift?.date === state.today ? state.nextShift.shiftName : null);
  const currentShiftRange = state.attendance?.shiftStartTime
    ? `${state.attendance.shiftStartTime.slice(0, 5)} - ${state.attendance.shiftEndTime?.slice(0, 5) ?? "—"}`
    : state.nextShift?.date === state.today
      ? formatShiftRange(state.nextShift)
      : "—";

  const progressValue =
    state.status === "done" ||
    state.status === "ready_to_checkout" ||
    state.status === "checkout_pending"
      ? 100
      : state.status === "working" && state.checklist.total > 0
        ? Math.round((state.checklist.done / state.checklist.total) * 100)
        : state.attendance?.checkIn
          ? 50
          : 0;
  const progressHint =
    state.checklist.total > 0
      ? `${state.checklist.done}/${state.checklist.total}`
      : state.status === "not_required"
        ? copy.descriptionNotRequired
        : state.status === "not_started" || state.status === "missing_branch"
          ? copy.notYet
          : title;
  const progressTone =
    tone === "success" ? "success" : tone === "warning" ? "warning" : "default";
  const todayMeta = currentShiftName
    ? `${formatDateVN(state.today)} · ${currentShiftName} ${currentShiftRange}`
    : `${formatDateVN(state.today)} · ${copy.noTodayShift}`;
  const checkOutDisplay =
    state.attendance?.checkOut ?? state.attendance?.checkoutRequestedAt ?? null;
  const todayMetrics: TodayMetric[] = [
    {
      label: copy.branch,
      value: state.branchName ?? copy.noBranch,
      muted: !state.branchName,
    },
    {
      label: copy.checkIn,
      value: state.attendance?.checkIn
        ? formatTimeVN(state.attendance.checkIn)
        : "—",
      muted: !state.attendance?.checkIn,
      mono: true,
    },
    {
      label: copy.checkOut,
      value: checkOutDisplay ? formatTimeVN(checkOutDisplay) : "—",
      hint:
        state.attendance?.checkoutRequestedAt && !state.attendance?.checkOut
          ? copy.checkoutPending
          : undefined,
      muted: !checkOutDisplay,
      mono: true,
    },
    {
      label: copy.workProgress,
      value: `${progressValue}%`,
      hint: progressHint,
      mono: true,
      progress: {
        value: progressValue,
        tone: progressTone,
      },
    },
  ];

  const primaryAction =
    state.status === "missing_profile" ? (
      <Button
        asChild
        variant="outline"
        size="touch"
        className="w-full sm:w-fit"
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
        size="touch"
        className="w-full sm:w-fit"
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
        size="touch"
        className="w-full sm:w-fit"
      >
        <Link href="/employee/schedule">
          <IconClock data-icon="inline-start" />
          {copy.viewSchedule}
        </Link>
      </Button>
    ) : state.status === "not_started" ? (
      <Button asChild size="touch" className="w-full sm:w-fit">
        <Link href="/employee/clock">
          <IconCamera data-icon="inline-start" />
          {copy.clockIn}
        </Link>
      </Button>
    ) : state.status === "working" ? (
      <Button asChild size="touch" className="w-full sm:w-fit">
        <Link href="/employee/tasks">
          <IconListChecks data-icon="inline-start" />
          {copy.shiftTasks}
        </Link>
      </Button>
    ) : state.status === "ready_to_checkout" ? (
      <Button asChild size="touch" className="w-full sm:w-fit">
        <Link href="/employee/clock">
          <IconLogout data-icon="inline-start" />
          {copy.clockOut}
        </Link>
      </Button>
    ) : state.status === "checkout_pending" ? (
      <Button
        variant="outline"
        size="touch"
        className="w-full sm:w-fit"
        disabled
      >
        <IconClock data-icon="inline-start" />
        {copy.checkoutPending}
      </Button>
    ) : (
      <Button
        variant="outline"
        size="touch"
        className="w-full sm:w-fit"
        disabled
      >
        <IconDone data-icon="inline-start" />
        {copy.completed}
      </Button>
    );

  return (
    <EmployeePageShell title={copy.title} description={copy.description}>
      <EmployeeDashboardGrid
        aside={
          managerTools.length > 0 ? (
            <EmployeeActionSection
              title={copy.managerToolsTitle}
              description={copy.managerToolsDescription}
              links={managerTools.map((link) => ({
                key: link.moduleKey,
                href: link.href,
                icon: link.icon,
                title: link.title,
                description: link.description,
              }))}
              columns={1}
            />
          ) : undefined
        }
      >
        <EmployeePanel
          icon={state.status === "done" ? IconDone : IconClock}
          title={copy.todayWorkTitle}
          description={todayMeta}
          tone={tone}
          contentClassName="gap-4"
        >
          <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {copy.nextActionTitle}
              </p>
              <p className="font-heading mt-1 text-base font-semibold tracking-tight">
                {title}
              </p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:min-w-40">
              {primaryAction}
            </div>
          </div>
          <WorkStepList steps={workflowSteps} />
          <TodayMetricGrid rows={todayMetrics} />
        </EmployeePanel>

        <EmployeeActionSection
          title={copy.operationToolsTitle}
          description={copy.operationToolsDescription}
          links={operationHandoffs.map((link) => ({
            key: link.moduleKey,
            href: link.href,
            icon: link.icon,
            title: link.title,
            description: link.description,
          }))}
          columns={2}
        />
      </EmployeeDashboardGrid>
    </EmployeePageShell>
  );
}
