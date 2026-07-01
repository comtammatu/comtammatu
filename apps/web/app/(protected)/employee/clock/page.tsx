import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays as IconCalendarDays,
  ListChecks as IconListChecks,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { getTodayWorkState } from "../_lib/today-work-state";
import { resolveEmployeeBranchRuntimePath } from "../_lib/branch-runtime-redirect";
import { ClockClient } from "./clock-client";

const copy = messages.employee.home;

export type EmployeeClockRoutes = {
  home: string;
  tasks: string;
  schedule: string;
  managerHr: string;
};

const DEFAULT_CLOCK_ROUTES: EmployeeClockRoutes = {
  home: "/employee",
  tasks: "/employee/tasks",
  schedule: "/employee/schedule",
  managerHr: "/hr",
};

export async function ClockPageContent({
  routes = DEFAULT_CLOCK_ROUTES,
}: {
  routes?: EmployeeClockRoutes;
} = {}) {
  const state = await getTodayWorkState();

  if (state.status === "missing_profile") {
    return (
      <EmployeePage title={copy.clockTodayTitle} hideHeaderOnMobile>
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  return (
    <EmployeePage
      title={copy.clockTodayTitle}
      hideHeaderOnMobile
      action={
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link
            href={state.managerAttendanceOnly ? routes.managerHr : routes.tasks}
          >
            {state.managerAttendanceOnly ? (
              <IconCalendarDays data-icon="inline-start" />
            ) : (
              <IconListChecks data-icon="inline-start" />
            )}
            {state.managerAttendanceOnly
              ? copy.managerHrTitle
              : copy.shiftTasks}
          </Link>
        </Button>
      }
    >
      <ClockClient state={state} routes={routes} />
    </EmployeePage>
  );
}

export default async function ClockPage() {
  const { claims } = await loadAuthState();
  const branchRuntimePath = resolveEmployeeBranchRuntimePath(
    claims,
    "shiftClock",
  );
  if (branchRuntimePath) redirect(branchRuntimePath);

  return <ClockPageContent />;
}
