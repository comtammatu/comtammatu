import { getEmployeeContext } from "../_lib/employee-context";
import { ScheduleClient } from "./schedule-client";
import type { ScheduleShift } from "./actions";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { EmployeePage } from "../components/employee-page";
import {
  getVNWeekEndDateString,
  getVNWeekStartDateString,
} from "@comtammatu/shared/time";

export default async function SchedulePage() {
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return (
      <EmployeePage
        title="Lịch ca"
        description="Xem ca làm theo tuần và quay nhanh về tuần hiện tại."
      >
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Chưa có hồ sơ nhân viên</EmptyTitle>
            <EmptyDescription>
              Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  const weekStart = getVNWeekStartDateString();
  const weekEndStr = getVNWeekEndDateString(weekStart);

  const { data } = await supabase
    .from("shift_assignments")
    .select("date, shifts ( name, start_time, end_time )")
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", weekStart)
    .lte("date", weekEndStr)
    .order("date");

  const initialShifts: ScheduleShift[] = (data ?? []).map((row) => {
    // supabase-js typegen infers M:1 FK as array, but PostgREST returns
    // a single object at runtime. Cast through unknown to match runtime.
    const shift = row.shifts as unknown as {
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
    <EmployeePage
      title="Lịch ca"
      description="Xem ca làm theo tuần và quay nhanh về tuần hiện tại."
    >
      <ScheduleClient
        initialShifts={initialShifts}
        initialWeekStart={weekStart}
      />
    </EmployeePage>
  );
}
