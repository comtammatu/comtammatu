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
  EmployeeWorkflowPanel,
} from "../components/employee-page";
import { formatTimeVN } from "../_lib/vn-business-date";
import { getTodayWorkState } from "../_lib/today-work-state";
import { TasksClient } from "./tasks-client";

const copy = messages.employee.home;
const taskCopy = messages.employee.tasks;

export default async function EmployeeTasksPage() {
  const state = await getTodayWorkState();

  if (state.status === "missing_profile") {
    return (
      <EmployeePage
        title={copy.shiftTasks}
        description={taskCopy.description}
      >
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  if (state.status === "not_started" || state.status === "missing_branch") {
    return (
      <EmployeePage
        title={copy.shiftTasks}
        description={taskCopy.description}
      >
        <EmployeeWorkflowPanel
          icon={IconCamera}
          title={taskCopy.notStartedTitle}
          description={taskCopy.notStartedDescription}
          tone="warning"
          badge={{ children: taskCopy.notStartedBadge, variant: "warning" }}
          details={[
            {
              label: copy.branch,
              value: state.branchName ?? copy.noBranch,
              muted: !state.branchName,
            },
          ]}
          detailsColumns={1}
          progress={{
            label: copy.workProgress,
            value: 0,
            description: copy.notYet,
            tone: "warning",
          }}
          primaryAction={
            state.status === "missing_branch" ? null : (
              <Button asChild size="touch" className="w-full sm:w-fit">
                <Link href="/employee/clock">
                  <IconCamera data-icon="inline-start" />
                  {copy.clockIn}
                </Link>
              </Button>
            )
          }
        />
      </EmployeePage>
    );
  }

  const allDone = state.checklist.remaining === 0;
  const progressValue =
    state.checklist.total > 0
      ? Math.round((state.checklist.done / state.checklist.total) * 100)
      : 100;
  const badge = allDone
    ? { children: taskCopy.doneBadge, variant: "success" as const }
    : {
        children: `${state.checklist.remaining} ${taskCopy.remainingSuffix}`,
        variant: "warning" as const,
      };

  return (
    <EmployeePage
      title={copy.shiftTasks}
      description={taskCopy.description}
      action={
        allDone ? (
          <Button asChild size="touch" className="w-full sm:w-fit">
            <Link href="/employee/clock">
              <IconClock data-icon="inline-start" />
              {copy.clockOut}
            </Link>
          </Button>
        ) : null
      }
    >
      <EmployeeWorkflowPanel
        icon={allDone ? IconDone : IconListChecks}
        title={taskCopy.checklistTitle}
        description={
          allDone
            ? taskCopy.checklistDoneDescription
            : taskCopy.checklistWorkingDescription
        }
        tone={allDone ? "success" : "info"}
        badge={badge}
        details={[
          {
            label: copy.branch,
            value: state.branchName ?? copy.noBranch,
            muted: !state.branchName,
          },
          {
            label: copy.checkIn,
            value: state.attendance?.checkIn
              ? formatTimeVN(state.attendance.checkIn)
              : "—",
          },
        ]}
        progress={{
          label: copy.workProgress,
          value: progressValue,
          description:
            state.checklist.total > 0
              ? `${state.checklist.done}/${state.checklist.total} ${copy.tasksDone}`
              : taskCopy.noChecklistProgress,
          tone: allDone ? "success" : "default",
        }}
      >
        {state.checklist.items.length > 0 ? (
          <TasksClient items={state.checklist.items} />
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
      </EmployeeWorkflowPanel>
    </EmployeePage>
  );
}
