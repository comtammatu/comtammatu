import Link from "next/link";
import {
  Camera as IconCamera,
  CheckCircle2 as IconDone,
  Clock as IconClock,
  ListChecks as IconListChecks,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { messages } from "@lib/messages";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
  EmployeePanel,
} from "../components/employee-page";
import { getTodayWorkState } from "../_lib/today-work-state";
import { TasksClient } from "./tasks-client";

const copy = messages.employee.home;
const taskCopy = messages.employee.tasks;

export default async function EmployeeTasksPage() {
  const state = await getTodayWorkState();

  if (state.status === "missing_profile") {
    return (
      <EmployeePage title={copy.shiftTasks}>
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  if (
    state.status === "not_started" ||
    state.status === "missing_branch" ||
    state.status === "not_required"
  ) {
    return (
      <EmployeePage title={copy.shiftTasks}>
        <EmployeePanel
          icon={state.status === "not_required" ? IconListChecks : IconCamera}
          title={
            state.status === "not_required"
              ? copy.statusNotRequired
              : taskCopy.notStartedTitle
          }
          description={
            state.status === "missing_branch"
              ? copy.descriptionNoBranch
              : state.status === "not_required"
                ? copy.descriptionNotRequired
                : taskCopy.notStartedDescription
          }
          tone={state.status === "not_required" ? "info" : "warning"}
        >
          {state.status === "missing_branch" ||
          state.status === "not_required" ? null : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild size="touch" className="w-full sm:w-fit">
                <Link href="/employee/clock">
                  <IconCamera data-icon="inline-start" />
                  {copy.clockIn}
                </Link>
              </Button>
            </div>
          )}
        </EmployeePanel>
      </EmployeePage>
    );
  }

  const allDone = state.checklist.remaining === 0;
  const checkoutPending = state.status === "checkout_pending";
  const checkoutDone = state.status === "done";

  return (
    <EmployeePage
      title={copy.shiftTasks}
      action={
        allDone && !checkoutPending && !checkoutDone ? (
          <Button asChild size="touch" className="w-full sm:w-fit">
            <Link href="/employee/clock">
              <IconClock data-icon="inline-start" />
              {copy.clockOut}
            </Link>
          </Button>
        ) : checkoutPending ? (
          <Button
            variant="outline"
            size="touch"
            className="w-full sm:w-fit"
            disabled
          >
            <IconClock data-icon="inline-start" />
            {copy.checkoutPending}
          </Button>
        ) : null
      }
    >
      <EmployeePanel
        icon={allDone ? IconDone : IconListChecks}
        title={taskCopy.checklistTitle}
        tone={checkoutPending ? "warning" : allDone ? "success" : "info"}
        contentClassName="gap-2"
      >
        {state.checklist.items.length > 0 ? (
          <TasksClient
            items={state.checklist.items}
            disabled={checkoutPending || checkoutDone}
          />
        ) : (
          <Empty>
            <EmptyMedia variant="icon">
              <IconListChecks />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{taskCopy.noChecklistTitle}</EmptyTitle>
              <EmptyDescription>
                {taskCopy.noChecklistDescription}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </EmployeePanel>
    </EmployeePage>
  );
}
