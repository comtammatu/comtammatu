import { loadAuthState } from "@/_lib/auth";
import { ScheduleClient } from "./schedule-client";
import type { ScheduleShift } from "./actions";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayStr = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayStr}`;
}

export default async function SchedulePage() {
  const { supabase, session, claims } = await loadAuthState();

  // Find employee record for current user
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Chưa có hồ sơ nhân viên</EmptyTitle>
          <EmptyDescription>
            Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Fetch current week's schedule
  const weekStart = getMonday(new Date());
  const weekEnd = new Date(weekStart + "T00:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);
  const wy = weekEnd.getFullYear();
  const wm = String(weekEnd.getMonth() + 1).padStart(2, "0");
  const wd = String(weekEnd.getDate()).padStart(2, "0");
  const weekEndStr = `${wy}-${wm}-${wd}`;

  const { data } = await supabase
    .from("shift_assignments")
    .select("date, shifts ( name, start_time, end_time )")
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", weekStart)
    .lte("date", weekEndStr)
    .order("date");

  const initialShifts: ScheduleShift[] = (data ?? []).map((row) => {
    const shift = row.shifts as {
      name: string;
      start_time: string;
      end_time: string;
    } | null;
    return {
      date: row.date,
      shift_name: shift?.name ?? "Ca làm",
      start_time: shift?.start_time ?? "00:00",
      end_time: shift?.end_time ?? "00:00",
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Lịch ca</CardTitle>
          <CardDescription>Lịch làm việc theo tuần.</CardDescription>
        </CardHeader>
      </Card>

      <ScheduleClient
        initialShifts={initialShifts}
        initialWeekStart={weekStart}
      />
    </div>
  );
}
