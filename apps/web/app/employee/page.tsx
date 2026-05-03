import Link from "next/link";
import type { ElementType } from "react";
import {
  ArrowRight as IconArrowRight,
  BarChart3 as IconChartBar,
  Briefcase as IconBriefcase,
  CalendarDays as IconCalendarEvent,
  ChefHat as IconChefHat,
  Clock as IconClock,
  CreditCard as IconCreditCard,
  LayoutDashboard as IconLayoutDashboard,
  ListChecks as IconListChecks,
  LogIn as IconDoorEnter,
  LogOut as IconLogout,
  Monitor as IconDeviceDesktop,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  ShieldCheck as IconShieldCheck,
  UserCircle as IconUserCircle,
  Users as IconUsers,
  Utensils as IconToolsKitchen,
  Wallet as IconWallet,
} from "lucide-react";
import {
  resolveDiscoveredAppGroups,
  type DiscoveredAppGroup,
  type DiscoveredAppLink,
} from "@comtammatu/shared/auth";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { loadAuthState } from "@/_lib/auth";
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

const PORTAL_ICON_MAP: Record<string, ElementType> = {
  LayoutDashboard: IconLayoutDashboard,
  BarChart3: IconChartBar,
  Users: IconUsers,
  Wallet: IconWallet,
  Package: IconPackage,
  Briefcase: IconBriefcase,
  Monitor: IconDeviceDesktop,
  Settings: IconSettings,
  ChefHat: IconChefHat,
  Receipt: IconReceipt,
  ToolsKitchen: IconToolsKitchen,
  ShieldCheck: IconShieldCheck,
};

function getPortalBlockedReason(
  app: DiscoveredAppLink,
  branchIsHq: boolean,
): string | null {
  if (branchIsHq && (app.moduleKey === "pos" || app.moduleKey === "kds")) {
    return "Điểm vận hành này không dùng POS/KDS.";
  }

  if (
    app.status === "blocked" &&
    app.blockedReason === "missing-branch-context"
  ) {
    return "Chưa gắn chi nhánh.";
  }

  return null;
}

function PortalModuleItem({
  app,
  branchIsHq,
}: {
  app: DiscoveredAppLink;
  branchIsHq: boolean;
}) {
  const Icon = PORTAL_ICON_MAP[app.icon] ?? IconArrowRight;
  const blockedReason = getPortalBlockedReason(app, branchIsHq);

  if (blockedReason || !app.href) {
    return (
      <Item variant="outline" className="items-center opacity-70" aria-disabled>
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{app.label}</ItemTitle>
          <ItemDescription>{blockedReason ?? "Chưa mở."}</ItemDescription>
        </ItemContent>
      </Item>
    );
  }

  return (
    <Item asChild variant="outline" className="items-center">
      <Link href={app.href}>
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{app.label}</ItemTitle>
        </ItemContent>
        <ItemActions>
          <IconArrowRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Link>
    </Item>
  );
}

function PortalModuleGroups({
  groups,
  branchIsHq,
}: {
  groups: DiscoveredAppGroup[];
  branchIsHq: boolean;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <EmployeePanel
          key={`${group.surface}-${group.title}`}
          title={group.title}
        >
          <EmployeeActionList columns={2}>
            {group.items.map((app) => (
              <PortalModuleItem
                key={`${app.moduleKey}-${app.href ?? app.blockedReason ?? "blocked"}`}
                app={app}
                branchIsHq={branchIsHq}
              />
            ))}
          </EmployeeActionList>
        </EmployeePanel>
      ))}
    </div>
  );
}

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
        shiftName: shift?.name ?? "Ca làm",
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

  const moduleGroups = resolveDiscoveredAppGroups(claims.user_role, branchId, {
    includeBlocked: true,
  })
    .map((group) => ({
      ...group,
      items: group.items.filter((app) => {
        if (app.status !== "blocked") return true;
        if (app.moduleKey !== "branch_settings") return true;
        return claims.user_role === "branch_manager";
      }),
    }))
    .filter((group) => group.items.length > 0);

  const clockTone =
    clockState === "working"
      ? "info"
      : clockState === "done"
        ? "success"
        : "warning";
  const clockTitle =
    clockState === "working"
      ? "Đang làm việc"
      : clockState === "done"
        ? "Đã hoàn thành hôm nay"
        : "Chưa chấm công";
  const clockDescription =
    clockState === "working"
      ? "Kết thúc ca khi bàn giao xong."
      : clockState === "done"
        ? "Chấm công hôm nay đã đủ giờ vào và giờ ra."
        : "Bắt đầu bằng GPS và mã QR tại chi nhánh.";

  return (
    <EmployeePageShell
      title="Hôm nay"
      description="Việc cần làm trong ca: chấm công, lịch ca, ngày công và phiếu lương."
    >
      <EmployeePanel
        icon={clockState === "not_started" ? IconDoorEnter : IconClock}
        title={clockTitle}
        description={clockDescription}
        tone={clockTone}
        badge={
          clockState === "working"
            ? { children: "Đang mở", variant: "info" }
            : undefined
        }
      >
        <EmployeeDetailList
          rows={[
            {
              label: "Chi nhánh",
              value: clockBranchName ?? ctx?.branchName ?? "Chưa gắn",
              muted: !clockBranchName && !ctx?.branchName,
            },
            {
              label: "Giờ vào",
              value: checkInTime ? formatTimeVN(checkInTime) : "—",
            },
            {
              label: "Giờ ra",
              value: checkOutTime ? formatTimeVN(checkOutTime) : "—",
            },
          ]}
        />
        {clockState !== "done" ? (
          <div className="flex">
            <Button asChild size="lg" className="w-full sm:w-fit">
              <Link href="/employee/clock">
                <IconDoorEnter data-icon="inline-start" />
                {clockState === "working" ? "Chấm công ra" : "Chấm công vào"}
              </Link>
            </Button>
          </div>
        ) : null}
      </EmployeePanel>

      {nextShift ? (
        <EmployeePanel
          icon={IconCalendarEvent}
          title="Ca tiếp theo"
          description={nextShift.shiftName}
          tone={nextShift.date === today ? "info" : "default"}
          badge={
            nextShift.date === today
              ? { children: "Hôm nay", variant: "info" }
              : undefined
          }
        >
          <EmployeeDetailList
            rows={[
              {
                label: "Ngày",
                value:
                  nextShift.date === today
                    ? "Hôm nay"
                    : formatDateVN(nextShift.date),
              },
              {
                label: "Khung giờ",
                value: `${nextShift.startTime} - ${nextShift.endTime}`,
              },
            ]}
          />
          <div className="flex">
            <Button asChild variant="outline" className="w-full sm:w-fit">
              <Link href="/employee/schedule">
                Xem lịch ca
                <IconArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </EmployeePanel>
      ) : null}

      <EmployeePanel title="Tự phục vụ">
        <EmployeeActionList columns={2}>
          <EmployeeActionItem
            href="/employee/schedule"
            icon={IconCalendarEvent}
            title="Lịch ca"
            description="Ca làm trong tuần"
          />
          <EmployeeActionItem
            href="/employee/attendance"
            icon={IconListChecks}
            title="Ngày công"
            description="Lịch sử vào ca, ra ca"
          />
          <EmployeeActionItem
            href="/employee/payslip"
            icon={IconCreditCard}
            title="Phiếu lương"
            description="Các kỳ lương đã phát hành"
          />
          <EmployeeActionItem
            href="/employee/profile"
            icon={IconUserCircle}
            title="Cá nhân"
            description="Hồ sơ, chi nhánh và quyền truy cập"
          />
        </EmployeeActionList>
      </EmployeePanel>

      <PortalModuleGroups groups={moduleGroups} branchIsHq={branchIsHq} />

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
