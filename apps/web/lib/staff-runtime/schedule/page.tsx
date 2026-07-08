import { getEmployeeContext } from "../_lib/staff-runtime-context";
import { ScheduleClient } from "./schedule-client";
import { fetchMySchedule, type ScheduleMonthData } from "./actions";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/staff-runtime-page";
import { getVNMonthStartDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";

const copy = messages.employee.home;

const EMPTY_SCHEDULE: ScheduleMonthData = {
  attendance: [],
  leaves: [],
  annualLeaveBalance: null,
  monthlyAnnualLeaveDays: 0,
};

export async function SchedulePageContent({
  leaveHref = "/br",
  profileHref,
}: {
  leaveHref?: string;
  profileHref?: string;
} = {}) {
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return (
      <EmployeePage title={copy.scheduleTitle} hideHeaderOnMobile>
        <EmployeeMissingProfileEmpty profileHref={profileHref} />
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  const monthStart = getVNMonthStartDateString(new Date());

  const [scheduleResult, employeeResult] = await Promise.all([
    fetchMySchedule(monthStart),
    supabase
      .from("employees")
      .select("base_salary")
      .eq("id", employeeId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
  ]);

  return (
    <EmployeePage title={copy.scheduleTitle} hideHeaderOnMobile>
      <ScheduleClient
        initialData={
          scheduleResult.success
            ? (scheduleResult.data ?? EMPTY_SCHEDULE)
            : EMPTY_SCHEDULE
        }
        initialMonthStart={monthStart}
        leaveHref={leaveHref}
        monthlySalary={employeeResult.data?.base_salary ?? 0}
      />
    </EmployeePage>
  );
}

export default function SchedulePage() {
  return <SchedulePageContent />;
}
