import Link from "next/link";
import {
  CalendarDays as IconCalendarDays,
  ListChecks as IconListChecks,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/staff-runtime-page";
import { getTodayWorkState } from "../_lib/today-work-state";
import {
  ClockClient,
  type ClockPlane,
  type EmployeeClockRoutes,
} from "./clock-client";

export type { EmployeeClockRoutes };

const copy = messages.employee.home;

type StaffClockPageContentProps = {
  routes: EmployeeClockRoutes;
  plane?: ClockPlane;
};

export async function StaffClockPageContent({
  routes,
  plane = "employee",
}: StaffClockPageContentProps) {
  const state = await getTodayWorkState();
  const PageShell = plane === "branch" ? BranchOperatorPage : EmployeePage;

  if (state.status === "missing_profile") {
    return (
      <PageShell
        title={copy.clockTodayTitle}
        hideHeaderOnMobile={plane === "branch"}
      >
        <EmployeeMissingProfileEmpty profileHref={routes.profile} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={copy.clockTodayTitle}
      hideHeaderOnMobile={plane === "branch"}
      action={
        <Button
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
          render={
            <Link
              href={
                state.managerAttendanceOnly ? routes.managerHr : routes.tasks
              }
            />
          }
        >
          {state.managerAttendanceOnly ? (
            <IconCalendarDays data-icon="inline-start" />
          ) : (
            <IconListChecks data-icon="inline-start" />
          )}
          {state.managerAttendanceOnly ? copy.managerHrTitle : copy.shiftTasks}
        </Button>
      }
    >
      <ClockClient state={state} routes={routes} plane={plane} />
    </PageShell>
  );
}
