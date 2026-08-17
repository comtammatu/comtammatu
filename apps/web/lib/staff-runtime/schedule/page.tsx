import { getEmployeeContext } from "../_lib/staff-runtime-context";
import { ScheduleClient } from "./schedule-client";
import { fetchMySchedule, type ScheduleMonthData } from "./actions";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/staff-runtime-page";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { getVNMonthStartDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import type { SchedulePlane } from "./schedule-client";

const copy = messages.employee.home;

const EMPTY_SCHEDULE: ScheduleMonthData = {
  attendance: [],
  leaves: [],
  annualLeaveBalance: null,
  monthlyLeaveBalance: null,
  standardWorkdays: 26,
};

type StaffSchedulePageContentProps = {
  leaveHref: string;
  profileHref: string;
  plane?: SchedulePlane;
};

export async function StaffSchedulePageContent({
  leaveHref,
  profileHref,
  plane = "employee",
}: StaffSchedulePageContentProps) {
  const ctx = await getEmployeeContext();
  const PageShell = plane === "branch" ? BranchOperatorPage : EmployeePage;

  if (!ctx) {
    return (
      <PageShell
        title={copy.scheduleTitle}
        hideHeaderOnMobile={plane === "branch"}
      >
        <EmployeeMissingProfileEmpty profileHref={profileHref} />
      </PageShell>
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
    <PageShell
      title={copy.scheduleTitle}
      hideHeaderOnMobile={plane === "branch"}
    >
      <ScheduleClient
        initialData={
          scheduleResult.success
            ? (scheduleResult.data ?? EMPTY_SCHEDULE)
            : EMPTY_SCHEDULE
        }
        initialMonthStart={monthStart}
        leaveHref={leaveHref}
        monthlySalary={employeeResult.data?.base_salary ?? 0}
        plane={plane}
      />
    </PageShell>
  );
}
