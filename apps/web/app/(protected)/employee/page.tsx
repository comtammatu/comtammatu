import Link from "next/link";
import {
  CalendarDays as IconCalendarEvent,
  ChefHat as IconChefHat,
  Clock as IconClock,
  CreditCard as IconCreditCard,
  ListChecks as IconListChecks,
  LogIn as IconDoorEnter,
  LogOut as IconLogout,
  Monitor as IconDeviceDesktop,
  MonitorUp as IconMonitorUp,
  UserCircle as IconUserCircle,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  EmployeeActionItem,
  EmployeeActionList,
  EmployeeDetailList,
  EmployeePage as EmployeePageShell,
  EmployeePanel,
} from "./components/employee-page";
import { getEmployeeContext } from "./_lib/employee-context";
import {
  formatDateVN,
  formatTimeShort,
  formatTimeVN,
  getTodayVN,
} from "./_lib/vn-business-date";

const copy = messages.employee.home;

const OPERATION_HANDOFFS = [
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
] as const;

export default async function EmployeePage() {
  const { supabase, claims } = await loadAuthState();
  const ctx = await getEmployeeContext();
  const branchId = ctx?.branchId ?? claims.branch_id;
  const today = getTodayVN();

  let clockState: "not_started" | "working" | "done" = "not_started";
  let checkInTime: string | null = null;
  let checkOutTime: string | null = null;
  let clockBranchName: string | null = null;

  if (ctx) {
    const { data: record } = await ctx.supabase
      .from("attendance_records")
      .select("check_in, check_out, branches ( name )")
      .eq("employee_id", ctx.employeeId)
      .eq("tenant_id", claims.tenant_id)
      .eq("date", today)
      .maybeSingle();

    if (record?.check_in && !record.check_out) {
      clockState = "working";
      checkInTime = record.check_in;
      const branchData = record.branches as unknown as { name: string } | null;
      clockBranchName = branchData?.name ?? null;
    } else if (record?.check_out) {
      clockState = "done";
      checkInTime = record.check_in;
      checkOutTime = record.check_out;
      const branchData = record.branches as unknown as { name: string } | null;
      clockBranchName = branchData?.name ?? null;
    }
  }

  let nextShift: {
    date: string;
    shiftName: string;
    startTime: string;
    endTime: string;
  } | null = null;

  if (ctx) {
    const { data: upcoming } = await ctx.supabase
      .from("shift_assignments")
      .select("date, shifts ( name, start_time, end_time )")
      .eq("employee_id", ctx.employeeId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", today)
      .order("date")
      .limit(1)
      .maybeSingle();

    if (upcoming) {
      const shift = upcoming.shifts as unknown as {
        name: string;
        start_time: string;
        end_time: string;
      } | null;
      nextShift = {
        date: upcoming.date,
        shiftName: shift?.name ?? copy.defaultShiftName,
        startTime: shift?.start_time ?? "—",
        endTime: shift?.end_time ?? "—",
      };
    }
  }

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
    branchId && !branchIsHq
      ? OPERATION_HANDOFFS.filter((item) =>
          canAccess(claims.user_role, item.moduleKey),
        ).map((item) => ({
          ...item,
          href: item.href(branchId),
        }))
      : [];

  const hasEmployeeContext = Boolean(ctx);

  const clockTone = !hasEmployeeContext
    ? "warning"
    : clockState === "working"
      ? "info"
      : clockState === "done"
        ? "success"
        : "warning";
  const clockTitle = !hasEmployeeContext
    ? copy.statusNoProfile
    : clockState === "working"
      ? copy.statusWorking
      : clockState === "done"
        ? copy.statusDone
        : copy.statusNotStarted;
  const clockDescription = !hasEmployeeContext
    ? copy.descriptionNoProfile
    : clockState === "working"
      ? copy.descriptionWorking
      : clockState === "done"
        ? copy.descriptionDone
        : copy.descriptionNotStarted;
  const nextShiftDateLabel = nextShift
    ? nextShift.date === today
      ? copy.today
      : formatDateVN(nextShift.date)
    : null;
  const nextShiftDescription = nextShift
    ? `${nextShiftDateLabel} · ${formatTimeShort(nextShift.startTime)} - ${formatTimeShort(nextShift.endTime)}`
    : copy.noNextShift;
  const clockTimeLabel =
    checkInTime && checkOutTime
      ? `${formatTimeVN(checkInTime)} - ${formatTimeVN(checkOutTime)}`
      : checkInTime
        ? `${copy.checkIn} ${formatTimeVN(checkInTime)}`
        : checkOutTime
          ? `${copy.checkOut} ${formatTimeVN(checkOutTime)}`
          : "—";

  return (
    <EmployeePageShell title={copy.title} description={copy.description}>
      <EmployeePanel
        icon={clockState === "not_started" ? IconDoorEnter : IconClock}
        title={copy.workdayTitle}
        description={clockDescription}
        tone={clockTone}
        badge={{ children: clockTitle, variant: clockTone }}
        contentClassName="gap-4"
      >
        <EmployeeDetailList
          columns={3}
          rows={[
            {
              label: copy.branch,
              value: clockBranchName ?? ctx?.branchName ?? copy.noBranch,
              muted: !clockBranchName && !ctx?.branchName,
            },
            {
              label: copy.nextShiftTitle,
              value: nextShift ? (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{nextShift.shiftName}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {nextShiftDescription}
                  </span>
                </span>
              ) : (
                copy.noNextShift
              ),
              muted: !nextShift,
            },
            {
              label: copy.clockTime,
              value: clockTimeLabel,
              muted: !checkInTime && !checkOutTime,
            },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {!hasEmployeeContext ? (
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
          ) : clockState !== "done" ? (
            <Button asChild size="touch" className="w-full sm:w-fit">
              <Link href="/employee/clock">
                <IconDoorEnter data-icon="inline-start" />
                {clockState === "working" ? copy.clockOut : copy.clockIn}
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              variant="outline"
              size="touch"
              className="w-full sm:w-fit"
            >
              <Link href="/employee/attendance">
                <IconListChecks data-icon="inline-start" />
                {copy.attendanceTitle}
              </Link>
            </Button>
          )}
          {hasEmployeeContext ? (
            <Button
              asChild
              variant="outline"
              size="touch"
              className="w-full sm:w-fit"
            >
              <Link href="/employee/schedule">
                <IconCalendarEvent data-icon="inline-start" />
                {copy.viewSchedule}
              </Link>
            </Button>
          ) : null}
        </div>
      </EmployeePanel>

      <EmployeePanel title={copy.selfServiceTitle}>
        <EmployeeActionList columns={2}>
          <EmployeeActionItem
            href="/employee/schedule"
            icon={IconCalendarEvent}
            title={copy.scheduleTitle}
            description={copy.scheduleDescription}
          />
          <EmployeeActionItem
            href="/employee/shift-register"
            icon={IconCalendarEvent}
            title={copy.shiftRegisterTitle}
            description={copy.shiftRegisterDescription}
          />
          <EmployeeActionItem
            href="/employee/attendance"
            icon={IconListChecks}
            title={copy.attendanceTitle}
            description={copy.attendanceDescription}
          />
          <EmployeeActionItem
            href="/employee/payslip"
            icon={IconCreditCard}
            title={copy.payslipTitle}
            description={copy.payslipDescription}
          />
          <EmployeeActionItem
            href="/employee/profile"
            icon={IconUserCircle}
            title={copy.profileTitle}
            description={copy.profileDescription}
          />
        </EmployeeActionList>
      </EmployeePanel>

      {operationHandoffs.length > 0 ? (
        <EmployeePanel
          title={copy.operationToolsTitle}
          description={copy.operationToolsDescription}
          size="sm"
        >
          <EmployeeActionList columns={2}>
            {operationHandoffs.map((link) => (
              <EmployeeActionItem
                key={link.moduleKey}
                href={link.href}
                icon={link.icon}
                title={link.title}
                description={link.description}
                size="sm"
              />
            ))}
          </EmployeeActionList>
        </EmployeePanel>
      ) : null}

      <form
        action="/api/auth/signout"
        method="post"
        className="flex justify-start"
      >
        <Button type="submit" variant="outline" size="sm">
          <IconLogout data-icon="inline-start" />
          {ACTIONS_VI.signOut}
        </Button>
      </form>
    </EmployeePageShell>
  );
}
