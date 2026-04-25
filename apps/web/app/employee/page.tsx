import Link from "next/link";
import type { ElementType } from "react";
import { ArrowRight as IconArrowRight, BarChart3 as IconChartBar, Briefcase as IconBriefcase, CalendarDays as IconCalendarEvent, ChefHat as IconChefHat, Clock as IconClock, CreditCard as IconCreditCard, Monitor as IconDeviceDesktop, LayoutDashboard as IconLayoutDashboard, LogIn as IconDoorEnter, LogOut as IconLogout, Package as IconPackage, Receipt as IconReceipt, Settings as IconSettings, ShieldCheck as IconShieldCheck, Utensils as IconToolsKitchen, CircleUserRound as IconUserCircle, Users as IconUsers, Wallet as IconWallet } from "lucide-react";
import {
  resolveDiscoveredAppGroups,
  type DiscoveredAppGroup,
  type DiscoveredAppLink,
} from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { getEmployeeContext } from "./_lib/employee-context";
import { loadAuthState } from "@/_lib/auth";
import { getTodayVN, formatTimeVN } from "./_lib/vn-business-date";

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
    return "Trụ sở không dùng POS/KDS.";
  }

  if (app.status === "blocked" && app.blockedReason === "missing-branch-context") {
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
  const href = blockedReason ? null : app.href;

  return (
    <Item variant="outline" className="items-center">
      {href ? (
        <Button
          asChild
          variant="ghost"
          className="group h-auto w-full justify-start rounded-xl p-0"
        >
          <Link href={href} className="flex w-full items-center gap-4 px-4 py-3">
            <ItemMedia variant="icon">
              <Icon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{app.label}</ItemTitle>
            </ItemContent>
            <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      ) : (
        <div
          className="flex w-full items-center gap-4 px-4 py-3 opacity-60"
          aria-disabled="true"
        >
          <ItemMedia variant="icon">
            <Icon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{app.label}</ItemTitle>
            {blockedReason ? (
              <ItemDescription>{blockedReason}</ItemDescription>
            ) : null}
          </ItemContent>
        </div>
      )}
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
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={`${group.surface}-${group.title}`} className="space-y-2">
          <h2 className="text-sm font-semibold">{group.title}</h2>
          <ItemGroup className="gap-2">
            {group.items.map((app) => (
              <PortalModuleItem
                key={`${app.moduleKey}-${app.href ?? app.blockedReason ?? "blocked"}`}
                app={app}
                branchIsHq={branchIsHq}
              />
            ))}
          </ItemGroup>
        </section>
      ))}
    </div>
  );
}

export default async function EmployeePage() {
  const { supabase, claims } = await loadAuthState();
  const ctx = await getEmployeeContext();

  const branchId = ctx?.branchId ?? claims.branch_id;

  // Today's attendance status
  let clockState: "not_started" | "working" | "done" = "not_started";
  let checkInTime: string | null = null;
  let checkOutTime: string | null = null;
  let clockBranchName: string | null = null;

  if (ctx) {
    const today = getTodayVN();
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

  // Next shift — today or the next day with an assignment
  let nextShift: {
    date: string;
    shiftName: string;
    startTime: string;
    endTime: string;
  } | null = null;

  if (ctx) {
    const today = getTodayVN();
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

  // Branch info for POS/KDS links
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

  return (
    <div className="flex flex-col gap-5">
      {/* Clock state — first viewport on mobile */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          {clockState === "working" && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-info/12 text-info">
                  <IconClock className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Đang làm việc</p>
                  {clockBranchName && (
                    <p className="text-xs text-muted-foreground">
                      {clockBranchName}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Vào </span>
                  <span className="font-mono font-medium">
                    {checkInTime ? formatTimeVN(checkInTime) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Ra </span>
                  <span className="font-mono font-medium">—</span>
                </div>
              </div>
              <Button asChild className="w-full">
                <Link href="/employee/clock">
                  <IconDoorEnter data-icon="inline-start" />
                  Chấm công ra
                </Link>
              </Button>
            </>
          )}

          {clockState === "done" && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-success/12 text-success">
                  <IconClock className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    Đã hoàn thành hôm nay
                  </p>
                  {clockBranchName && (
                    <p className="text-xs text-muted-foreground">
                      {clockBranchName}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Vào </span>
                  <span className="font-mono font-medium">
                    {checkInTime ? formatTimeVN(checkInTime) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Ra </span>
                  <span className="font-mono font-medium">
                    {checkOutTime ? formatTimeVN(checkOutTime) : "—"}
                  </span>
                </div>
              </div>
            </>
          )}

          {clockState === "not_started" && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <IconDoorEnter className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Chưa chấm công</p>
                  <p className="text-xs text-muted-foreground">
                    Bắt đầu ca làm của bạn
                  </p>
                </div>
              </div>
              <Button asChild className="w-full">
                <Link href="/employee/clock">
                  <IconDoorEnter data-icon="inline-start" />
                  Chấm công vào
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Next shift summary */}
      {nextShift && (
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <IconCalendarEvent className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {nextShift.shiftName}
              </p>
              <p className="text-sm text-muted-foreground">
                {nextShift.startTime} – {nextShift.endTime}
              </p>
              <p className="text-xs text-muted-foreground">
                {nextShift.date === getTodayVN() ? "Hôm nay" : nextShift.date}
              </p>
            </div>
            <Button asChild variant="ghost" size="icon">
              <Link href="/employee/schedule">
                <IconArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Self-service links */}
      <ItemGroup>
        <Item variant="outline" className="items-center">
          <Button
            asChild
            variant="ghost"
            className="group h-auto w-full justify-start rounded-xl p-0"
          >
            <Link
              href="/employee/schedule"
              className="flex w-full items-center gap-4 px-4 py-3"
            >
              <ItemMedia variant="icon">
                <IconCalendarEvent />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Lịch ca</ItemTitle>
              </ItemContent>
              <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </Item>

        <Item variant="outline" className="items-center">
          <Button
            asChild
            variant="ghost"
            className="group h-auto w-full justify-start rounded-xl p-0"
          >
            <Link
              href="/employee/attendance"
              className="flex w-full items-center gap-4 px-4 py-3"
            >
              <ItemMedia variant="icon">
                <IconClock />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Lịch sử chấm công</ItemTitle>
              </ItemContent>
              <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </Item>

        <Item variant="outline" className="items-center">
          <Button
            asChild
            variant="ghost"
            className="group h-auto w-full justify-start rounded-xl p-0"
          >
            <Link
              href="/employee/payslip"
              className="flex w-full items-center gap-4 px-4 py-3"
            >
              <ItemMedia variant="icon">
                <IconCreditCard />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Phiếu lương</ItemTitle>
              </ItemContent>
              <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </Item>

        <Item variant="outline" className="items-center">
          <Button
            asChild
            variant="ghost"
            className="group h-auto w-full justify-start rounded-xl p-0"
          >
            <Link
              href="/employee/profile"
              className="flex w-full items-center gap-4 px-4 py-3"
            >
              <ItemMedia variant="icon">
                <IconUserCircle />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>Cá nhân</ItemTitle>
              </ItemContent>
              <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </Item>
      </ItemGroup>

      <PortalModuleGroups groups={moduleGroups} branchIsHq={branchIsHq} />

      {/* Logout */}
      <form
        action="/api/auth/signout"
        method="post"
        className="flex justify-start"
      >
        <Button
          type="submit"
          variant="outline"
          className="gap-2 rounded-full px-4"
        >
          <IconLogout className="size-4" />
          Đăng xuất
        </Button>
      </form>
    </div>
  );
}
