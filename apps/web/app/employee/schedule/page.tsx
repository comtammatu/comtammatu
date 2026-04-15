import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
} from "@comtammatu/shared/auth";
import { ScheduleClient } from "./schedule-client";
import type { ScheduleShift } from "./actions";

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0]!;
}

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect(buildLoginBlockedStatePath());

  // Find employee record for current user
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lịch ca</h1>
        </div>
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.
          </p>
        </div>
      </div>
    );
  }

  // Fetch current week's schedule
  const weekStart = getMonday(new Date());
  const weekEnd = new Date(weekStart + "T00:00:00");
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split("T")[0]!;

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
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lịch ca</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lịch làm việc hàng tuần
        </p>
      </div>

      <ScheduleClient
        initialShifts={initialShifts}
        initialWeekStart={weekStart}
      />
    </div>
  );
}
