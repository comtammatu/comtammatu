import Link from "next/link";
import {
  CalendarDays as IconCalendarDays,
  ListChecks as IconListChecks,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppBackLink } from "@/components/surface";
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
  const managerHrCta =
    plane === "branch" &&
    state.status !== "missing_profile" &&
    state.managerAttendanceOnly ? (
      <Button
        variant="outline"
        size="touch"
        className="w-full"
        render={<Link href={routes.managerHr} />}
      >
        <IconCalendarDays data-icon="inline-start" />
        {copy.managerHrTitle}
      </Button>
    ) : null;

  if (state.status === "missing_profile") {
    return (
      <PageShell
        title={copy.clockTodayTitle}
        back={
          plane === "branch" ? <AppBackLink href={routes.tasks} /> : undefined
        }
      >
        <EmployeeMissingProfileEmpty profileHref={routes.profile} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={copy.clockTodayTitle}
      back={
        plane === "branch" ? <AppBackLink href={routes.tasks} /> : undefined
      }

      action={
        plane === "employee" ? (
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
            {state.managerAttendanceOnly
              ? copy.managerHrTitle
              : copy.shiftTasks}
          </Button>
        ) : undefined
      }
    >
      {managerHrCta}
      <ClockClient state={state} routes={routes} plane={plane} />
    </PageShell>
  );
}
