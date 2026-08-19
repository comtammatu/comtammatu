import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  CalendarDays as IconCalendarDays,
  ListChecks as IconListChecks,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
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
  const mobileTitleBar =
    plane === "branch" ? (
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={<Link href={routes.tasks} aria-label={ACTIONS_VI.back} />}
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{copy.clockTodayTitle}</p>
        </div>
      </BranchOperatorControlBar>
    ) : null;
  const managerHrCta =
    plane === "branch" && state.status !== "missing_profile" && state.managerAttendanceOnly ? (
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
        hideHeaderOnMobile={plane === "branch"}
      >
        {mobileTitleBar}
        <EmployeeMissingProfileEmpty profileHref={routes.profile} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={copy.clockTodayTitle}
      hideHeaderOnMobile={plane === "branch"}
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
            {state.managerAttendanceOnly ? copy.managerHrTitle : copy.shiftTasks}
          </Button>
        ) : undefined
      }
    >
      {mobileTitleBar}
      {managerHrCta}
      <ClockClient state={state} routes={routes} plane={plane} />
    </PageShell>
  );
}
