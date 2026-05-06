import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  CalendarDays as IconCalendarEvent,
  ChefHat as IconChefHat,
  Clock as IconClock,
  CreditCard as IconCreditCard,
  ListChecks as IconListChecks,
  LogIn as IconDoorEnter,
  LogOut as IconLogout,
  Monitor as IconDeviceDesktop,
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

  const clockTone =
    clockState === "working"
      ? "info"
      : clockState === "done"
        ? "success"
        : "warning";
  const clockTitle =
    clockState === "working"
      ? copy.statusWorking
      : clockState === "done"
        ? copy.statusDone
        : copy.statusNotStarted;
  const clockDescription =
    clockState === "working"
      ? copy.descriptionWorking
      : clockState === "done"
        ? copy.descriptionDone
        : copy.descriptionNotStarted;

  return (
    <EmployeePageShell title={copy.title} description={copy.description}>
      <EmployeePanel
        icon={clockState === "not_started" ? IconDoorEnter : IconClock}
        title={copy.clockPanelTitle}
        description={clockDescription}
        tone={clockTone}
        badge={{ children: clockTitle, variant: clockTone }}
      >
        <EmployeeDetailList
          rows={[
            {
              label: copy.branch,
              value: clockBranchName ?? ctx?.branchName ?? copy.noBranch,
              muted: !clockBranchName && !ctx?.branchName,
            },
            {
              label: copy.checkIn,
              value: checkInTime ? formatTimeVN(checkInTime) : "—",
            },
            {
              label: copy.checkOut,
              value: checkOutTime ? formatTimeVN(checkOutTime) : "—",
            },
          ]}
        />
        {clockState !== "done" ? (
          <div className="flex">
            <Button asChild size="lg" className="w-full sm:w-fit">
              <Link href="/employee/clock">
                <IconDoorEnter data-icon="inline-start" />
                {clockState === "working" ? copy.clockOut : copy.clockIn}
              </Link>
            </Button>
          </div>
        ) : null}
      </EmployeePanel>

      {nextShift ? (
        <EmployeePanel
          icon={IconCalendarEvent}
          title={copy.nextShiftTitle}
          description={nextShift.shiftName}
          tone={nextShift.date === today ? "info" : "default"}
          badge={
            nextShift.date === today
              ? { children: copy.today, variant: "info" }
              : undefined
          }
        >
          <EmployeeDetailList
            rows={[
              {
                label: copy.date,
                value:
                  nextShift.date === today
                    ? copy.today
                    : formatDateVN(nextShift.date),
              },
              {
                label: copy.timeRange,
                value: `${nextShift.startTime} - ${nextShift.endTime}`,
              },
            ]}
          />
          <div className="flex">
            <Button asChild variant="outline" className="w-full sm:w-fit">
              <Link href="/employee/schedule">
                {copy.viewSchedule}
                <IconArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </EmployeePanel>
      ) : (
        <EmployeePanel
          icon={IconCalendarEvent}
          title={copy.nextShiftTitle}
          description={copy.noNextShift}
          tone="default"
        >
          <div className="flex">
            <Button asChild variant="outline" className="w-full sm:w-fit">
              <Link href="/employee/schedule">
                {copy.viewSchedule}
                <IconArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </EmployeePanel>
      )}

      <EmployeePanel title={copy.selfServiceTitle}>
        <EmployeeActionList columns={2}>
          <EmployeeActionItem
            href="/employee/schedule"
            icon={IconCalendarEvent}
            title={copy.scheduleTitle}
            description={copy.scheduleDescription}
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
        >
          <EmployeeActionList columns={2}>
            {operationHandoffs.map((item) => (
              <EmployeeActionItem
                key={item.moduleKey}
                href={item.href}
                icon={item.icon}
                title={item.title}
                description={item.description}
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
        <Button type="submit" variant="outline">
          <IconLogout data-icon="inline-start" />
          {ACTIONS_VI.signOut}
        </Button>
      </form>
    </EmployeePageShell>
  );
}
