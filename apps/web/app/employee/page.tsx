import Link from "next/link";
import { ArrowRight as IconArrowRight, CalendarDays as IconCalendarEvent, ChefHat as IconChefHat, Clock as IconClock, CreditCard as IconCreditCard, Monitor as IconDeviceDesktop, LogIn as IconDoorEnter, LogOut as IconLogout, CircleUserRound as IconUserCircle } from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { getEmployeeContext } from "./_lib/employee-context";
import { loadAuthState } from "@/_lib/auth";
import { getTodayVN, formatTimeVN } from "./_lib/vn-business-date";

export default async function EmployeePage() {
  const { claims } = await loadAuthState();
  const ctx = await getEmployeeContext();

  const canPos = canAccess(claims.user_role, "pos");
  const canKds = canAccess(claims.user_role, "kds");
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
  if (branchId && ctx) {
    const { data } = await ctx.supabase
      .from("branches")
      .select("branch_kind")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchIsHq =
      data?.branch_kind === "central_warehouse" ||
      data?.branch_kind === "central_kitchen";
  }

  const posHref = branchId ? `/br/${branchId}/pos` : "/employee";
  const kdsHref = branchId ? `/br/${branchId}/kds` : "/employee";
  const posDisabled = !canPos || !branchId || branchIsHq;
  const kdsDisabled = !canKds || !branchId || branchIsHq;

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

      {/* POS/KDS handoff links — compact secondary placement */}
      {(canPos || canKds) && (
        <div className="flex gap-2">
          {canPos && (
            <Button
              asChild
              variant={posDisabled ? "outline" : "secondary"}
              className="flex-1"
              disabled={posDisabled}
            >
              <Link href={posHref}>
                <IconDeviceDesktop data-icon="inline-start" />
                POS
              </Link>
            </Button>
          )}
          {canKds && (
            <Button
              asChild
              variant={kdsDisabled ? "outline" : "secondary"}
              className="flex-1"
              disabled={kdsDisabled}
            >
              <Link href={kdsHref}>
                <IconChefHat data-icon="inline-start" />
                KDS
              </Link>
            </Button>
          )}
        </div>
      )}

      {!branchId && (canPos || canKds) && (
        <p className="text-xs text-muted-foreground">
          Chưa gắn chi nhánh — không thể mở POS/KDS. Liên hệ quản lý.
        </p>
      )}
      {branchId && branchIsHq && (canPos || canKds) && (
        <p className="text-xs text-muted-foreground">
          Trụ sở không dùng POS/KDS.
        </p>
      )}

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
