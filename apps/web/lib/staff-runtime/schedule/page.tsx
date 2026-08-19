import { getEmployeeContext } from "../_lib/staff-runtime-context";
import { ScheduleClient } from "./schedule-client";
import { fetchMySchedule, type ScheduleMonthData } from "./actions";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/staff-runtime-page";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { getVNMonthStartDateString } from "@comtammatu/shared/time";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { requestNow } from "@/_lib/request-now";
import type { SchedulePlane } from "./schedule-client";
import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

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
  routeBranchId?: number;
};

export async function StaffSchedulePageContent({
  leaveHref,
  profileHref,
  plane = "employee",
  routeBranchId,
}: StaffSchedulePageContentProps) {
  const ctx = await getEmployeeContext();
  const PageShell = plane === "branch" ? BranchOperatorPage : EmployeePage;
  const backHref =
    plane === "branch" && routeBranchId != null
      ? `/br/${routeBranchId}/shift`
      : null;
  const mobileTitleBar =
    plane === "branch" && backHref ? (
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={<Link href={backHref} aria-label={ACTIONS_VI.back} />}
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{copy.scheduleTitle}</p>
        </div>
      </BranchOperatorControlBar>
    ) : null;

  if (!ctx) {
    return (
      <PageShell
        title={copy.scheduleTitle}
        hideHeaderOnMobile={plane === "branch"}
      >
        {mobileTitleBar}
        <EmployeeMissingProfileEmpty profileHref={profileHref} />
      </PageShell>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  const monthStart = getVNMonthStartDateString(await requestNow());

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
      {mobileTitleBar}
      <ScheduleClient
        initialData={
          scheduleResult.success
            ? (scheduleResult.data ?? EMPTY_SCHEDULE)
            : EMPTY_SCHEDULE
        }
        initialMonthStart={monthStart}
        leaveHref={leaveHref}
        branchId={routeBranchId ?? ctx.branchId}
        monthlySalary={employeeResult.data?.base_salary ?? 0}
        plane={plane}
      />
    </PageShell>
  );
}
