import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { getEmployeeContext } from "../_lib/employee-context";
import { ScheduleClient } from "./schedule-client";
import type { ScheduleAttendance, ScheduleLeave } from "./actions";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import {
  getVNMonthEndDateString,
  getVNMonthStartDateString,
  getVNMonthYear,
} from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { resolveEmployeeBranchRuntimePath } from "../_lib/branch-runtime-redirect";

const copy = messages.employee.home;

export async function SchedulePageContent({
  leaveHref = "/employee/leave",
}: {
  leaveHref?: string;
} = {}) {
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return (
      <EmployeePage title={copy.scheduleTitle} hideHeaderOnMobile>
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  const now = new Date();
  const monthStart = getVNMonthStartDateString(now);
  const currentMonth = getVNMonthYear(now);
  const monthEndStr = getVNMonthEndDateString(
    currentMonth.year,
    currentMonth.month,
  );

  const [attendanceResult, leaveResult, employeeResult] = await Promise.all([
    supabase
      .from("attendance_records")
      .select(
        "date, check_in, check_out, status, shifts ( name, start_time, end_time )",
      )
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .gte("date", monthStart)
      .lte("date", monthEndStr)
      .order("date"),
    supabase
      .from("leave_requests")
      .select("start_date, end_date, status")
      .eq("employee_id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["pending", "approved"])
      .lte("start_date", monthEndStr)
      .gte("end_date", monthStart)
      .order("start_date"),
    supabase
      .from("employees")
      .select("base_salary")
      .eq("id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
  ]);

  const initialAttendance: ScheduleAttendance[] = (
    attendanceResult.data ?? []
  ).map((row) => {
    // supabase-js typegen infers M:1 FK as array, but PostgREST returns
    // a single object at runtime. Cast through unknown to match runtime.
    const shift = row.shifts as unknown as {
      name: string;
      start_time: string;
      end_time: string;
    } | null;
    return {
      date: row.date,
      check_in: row.check_in,
      check_out: row.check_out,
      status: row.status,
      shift_name: shift?.name ?? null,
      start_time: shift?.start_time ?? null,
      end_time: shift?.end_time ?? null,
    };
  });
  const initialLeaves: ScheduleLeave[] = (leaveResult.data ?? []).flatMap(
    (row) =>
      row.status === "pending" || row.status === "approved"
        ? [
            {
              start_date: row.start_date,
              end_date: row.end_date,
              status: row.status,
            },
          ]
        : [],
  );

  return (
    <EmployeePage title={copy.scheduleTitle} hideHeaderOnMobile>
      <ScheduleClient
        initialData={{
          attendance: initialAttendance,
          leaves: initialLeaves,
        }}
        initialMonthStart={monthStart}
        leaveHref={leaveHref}
        monthlySalary={employeeResult.data?.base_salary ?? 0}
      />
    </EmployeePage>
  );
}

export default async function SchedulePage() {
  const { claims } = await loadAuthState();
  const branchRuntimePath = resolveEmployeeBranchRuntimePath(
    claims,
    "shiftSchedule",
  );
  if (branchRuntimePath) redirect(branchRuntimePath);

  return <SchedulePageContent />;
}
