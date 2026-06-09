import { getEmployeeContext } from "../_lib/employee-context";
import { ScheduleClient } from "./schedule-client";
import type { ScheduleAttendance, ScheduleShift } from "./actions";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import {
  getVNWeekEndDateString,
  getVNWeekStartDateString,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";

const copy = messages.employee.home;

export default async function SchedulePage() {
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return (
      <EmployeePage
        title={copy.scheduleTitle}
        description={copy.scheduleLongDescription}
      >
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  const weekStart = getVNWeekStartDateString();
  const weekEndStr = getVNWeekEndDateString(weekStart);

  const [shiftResult, attendanceResult] = await Promise.all([
    supabase
      .from("shift_assignments")
      .select("date, shifts ( name, start_time, end_time )")
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", weekStart)
      .lte("date", weekEndStr)
      .order("date"),
    supabase
      .from("attendance_records")
      .select("date, check_in, check_out, status")
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", weekStart)
      .lte("date", weekEndStr)
      .order("date"),
  ]);

  const initialShifts: ScheduleShift[] = (shiftResult.data ?? []).map((row) => {
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
  const initialAttendance: ScheduleAttendance[] = (
    attendanceResult.data ?? []
  ).map((row) => ({
    date: row.date,
    check_in: row.check_in,
    check_out: row.check_out,
    status: row.status,
  }));

  return (
    <EmployeePage
      title={copy.scheduleTitle}
      description={copy.scheduleLongDescription}
    >
      <ScheduleClient
        initialData={{
          shifts: initialShifts,
          attendance: initialAttendance,
        }}
        initialWeekStart={weekStart}
      />
    </EmployeePage>
  );
}
