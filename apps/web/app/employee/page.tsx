import Link from "next/link";
import {
  Briefcase as IconBriefcase,
  Building2 as IconBuilding2,
  CalendarDays as IconCalendarEvent,
  ChefHat as IconChefHat,
  Clock as IconClock,
  CreditCard as IconCreditCard,
  ListChecks as IconListChecks,
  ListOrdered as IconListOrdered,
  LogIn as IconDoorEnter,
  LogOut as IconLogout,
  MessageCircle as IconMessageCircle,
  Monitor as IconDeviceDesktop,
  Package as IconPackage,
  Settings as IconSettings,
  ShoppingBag as IconShoppingBag,
  UserCircle as IconUserCircle,
  UtensilsCrossed as IconUtensilsCrossed,
} from "lucide-react";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";
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

const MANAGEMENT_LINKS: ReadonlyArray<{
  moduleKey: ModuleKey;
  href: string;
  icon: typeof IconShoppingBag;
  title: string;
  description: string;
}> = [
  {
    moduleKey: "orders",
    href: "/orders",
    icon: IconShoppingBag,
    title: copy.ordersTitle,
    description: copy.ordersDescription,
  },
  {
    moduleKey: "inventory",
    href: "/inventory",
    icon: IconPackage,
    title: copy.inventoryTitle,
    description: copy.inventoryDescription,
  },
  {
    moduleKey: "menu",
    href: "/menu",
    icon: IconUtensilsCrossed,
    title: copy.menuTitle,
    description: copy.menuDescription,
  },
  {
    moduleKey: "settings",
    href: "/admin/settings",
    icon: IconSettings,
    title: copy.settingsTitle,
    description: copy.settingsDescription,
  },
  {
    moduleKey: "feedback",
    href: "/admin/feedback",
    icon: IconMessageCircle,
    title: copy.feedbackTitle,
    description: copy.feedbackDescription,
  },
  {
    moduleKey: "hr",
    href: "/hr",
    icon: IconBriefcase,
    title: copy.hrTitle,
    description: copy.hrDescription,
  },
];

const BRANCH_MANAGEMENT_LINKS = (
  branchId: number,
): ReadonlyArray<{
  moduleKey: ModuleKey;
  href: string;
  icon: typeof IconShoppingBag;
  title: string;
  description: string;
}> => [
  {
    moduleKey: "branch_menu_limits",
    href: `/br/${branchId}/menu-limits`,
    icon: IconListOrdered,
    title: copy.branchMenuLimitsTitle,
    description: copy.branchMenuLimitsDescription,
  },
  {
    moduleKey: "branch_settings",
    href: `/br/${branchId}/settings`,
    icon: IconBuilding2,
    title: copy.branchSettingsTitle,
    description: copy.branchSettingsDescription,
  },
];

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

  const managementLinks = MANAGEMENT_LINKS.filter((link) =>
    canAccess(claims.user_role, link.moduleKey),
  );
  const branchManagementLinks = branchId
    ? BRANCH_MANAGEMENT_LINKS(branchId).filter((link) =>
        canAccess(claims.user_role, link.moduleKey),
      )
    : [];
  const showManagementPanel =
    managementLinks.length + branchManagementLinks.length > 0;
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
    ? `${nextShiftDateLabel} · ${nextShift.startTime} - ${nextShift.endTime}`
    : copy.noNextShift;

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
          className="grid-cols-3"
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
        <div className="flex">
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
        </div>
        <EmployeeActionItem
          href="/employee/schedule"
          icon={IconCalendarEvent}
          title={
            nextShift
              ? `${copy.nextShiftTitle}: ${nextShift.shiftName}`
              : copy.nextShiftTitle
          }
          description={nextShiftDescription}
          size="sm"
        />
      </EmployeePanel>

      {operationHandoffs.length > 0 ? (
        <EmployeePanel
          title={copy.operationToolsTitle}
          description={copy.operationToolsDescription}
          size="sm"
        >
          <EmployeeActionList columns={2}>
            {operationHandoffs.map((item) => (
              <EmployeeActionItem
                key={item.moduleKey}
                href={item.href}
                icon={item.icon}
                title={item.title}
                description={item.description}
                size="sm"
              />
            ))}
          </EmployeeActionList>
        </EmployeePanel>
      ) : null}

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

      {showManagementPanel ? (
        <EmployeePanel
          title={copy.managementTitle}
          description={copy.managementDescription}
          size="sm"
        >
          <EmployeeActionList>
            {managementLinks.map((link) => (
              <EmployeeActionItem
                key={link.moduleKey}
                href={link.href}
                icon={link.icon}
                title={link.title}
                description={link.description}
                size="sm"
              />
            ))}
            {branchManagementLinks.map((link) => (
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
