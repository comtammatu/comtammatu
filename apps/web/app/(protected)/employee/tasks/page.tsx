import Link from "next/link";
import {
  Camera as IconCamera,
  CheckCircle2 as IconDone,
  Clock as IconClock,
  ListChecks as IconListChecks,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import {
  EmployeeActionBar,
  EmployeeMissingProfileEmpty,
  EmployeePage,
  EmployeePanel,
  EmployeeStatusStrip,
} from "../components/employee-page";
import { getTodayWorkState } from "../_lib/today-work-state";
import { formatTimeVN } from "../_lib/vn-business-date";
import { TasksClient } from "./tasks-client";
import {
  fetchConsumptionIngredients,
  fetchConsumptionReportForAttendance,
} from "../consumption-actions";

const copy = messages.employee.home;
const taskCopy = messages.employee.tasks;
const managerTaskCopy = messages.employee.managerTasks;

export async function EmployeeTasksPageContent({
  clockHref = "/employee/clock",
  countHref = "/employee/count",
}: {
  clockHref?: string;
  countHref?: string;
} = {}) {
  const state = await getTodayWorkState();

  if (state.status === "missing_profile") {
    return (
      <EmployeePage title={copy.shiftTasks} hideHeaderOnMobile>
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  if (state.managerAttendanceOnly) {
    const actionLabel =
      state.status === "working"
        ? copy.clockOutDirect
        : state.status === "done"
          ? copy.completed
          : copy.clockIn;

    return (
      <EmployeePage title={copy.shiftTasks} hideHeaderOnMobile>
        <EmployeePanel
          icon={IconClock}
          title={managerTaskCopy.noTaskTitle}
          tone={state.status === "done" ? "success" : "info"}
          contentClassName="gap-3"
        >
          <EmployeeStatusStrip
            items={[
              {
                label: copy.checkInShort,
                value: state.attendance?.checkIn
                  ? formatTimeVN(state.attendance.checkIn)
                  : "—",
                muted: !state.attendance?.checkIn,
                mono: true,
              },
              {
                label: copy.checkOutShort,
                value: state.attendance?.checkOut
                  ? formatTimeVN(state.attendance.checkOut)
                  : "—",
                muted: !state.attendance?.checkOut,
                mono: true,
              },
            ]}
          />
          <EmployeeActionBar>
            <Button
              asChild
              size="touch-lg"
              className="w-full sm:w-fit"
              variant={state.status === "done" ? "outline" : "default"}
            >
              <Link href={clockHref}>
                <IconClock data-icon="inline-start" />
                {actionLabel}
              </Link>
            </Button>
          </EmployeeActionBar>
        </EmployeePanel>
      </EmployeePage>
    );
  }

  if (
    state.status === "not_started" ||
    state.status === "missing_branch" ||
    state.status === "not_required"
  ) {
    return (
      <EmployeePage title={copy.shiftTasks} hideHeaderOnMobile>
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
          contentClassName="gap-3"
        >
          {state.status === "missing_branch" ||
          state.status === "not_required" ? null : (
            <EmployeeActionBar>
              <Button asChild size="touch-lg" className="w-full sm:w-fit">
                <Link href={clockHref}>
                  <IconCamera data-icon="inline-start" />
                  {copy.clockIn}
                </Link>
              </Button>
            </EmployeeActionBar>
          )}
        </EmployeePanel>
      </EmployeePage>
    );
  }

  const allRequiredDone = state.checklist.requiredRemaining === 0;
  const checkoutPending = state.status === "checkout_pending";
  const checkoutDone = state.status === "done";
  const consumptionChecklistItem = state.checklist.items.find(
    (item) => item.taskKind === "consumption_report",
  );
  const hasConsumptionChecklist = Boolean(consumptionChecklistItem);
  const [ingredientsResult, consumptionReportResult] =
    hasConsumptionChecklist && state.attendance
      ? await Promise.all([
          fetchConsumptionIngredients(
            consumptionChecklistItem?.templateItemId ?? null,
          ),
          fetchConsumptionReportForAttendance(state.attendance.id),
        ])
      : [null, null];
  const consumptionIngredients =
    ingredientsResult?.success && ingredientsResult.data
      ? ingredientsResult.data
      : [];
  const consumptionReport =
    consumptionReportResult?.success && consumptionReportResult.data
      ? consumptionReportResult.data
      : null;
  const progressValue =
    state.checklist.total > 0
      ? Math.round((state.checklist.done / state.checklist.total) * 100)
      : 0;
  const stateLabel = checkoutDone
    ? copy.completed
    : checkoutPending
      ? copy.checkoutPending
      : allRequiredDone
        ? copy.statusReadyToCheckout
        : `${state.checklist.requiredRemaining} ${taskCopy.requiredRemaining}`;

  return (
    <EmployeePage title={copy.shiftTasks} hideHeaderOnMobile>
      <EmployeePanel
        icon={allRequiredDone ? IconDone : IconListChecks}
        title={taskCopy.checklistTitle}
        headerHint={`${state.checklist.done}/${state.checklist.total}`}
        tone={
          checkoutPending ? "warning" : allRequiredDone ? "success" : "info"
        }
        contentClassName="gap-3"
      >
        <EmployeeStatusStrip
          items={[
            {
              label: taskCopy.doneCount,
              value: `${state.checklist.done}/${state.checklist.total}`,
              mono: true,
            },
            {
              label: taskCopy.state,
              value: stateLabel,
              muted: !allRequiredDone && !checkoutPending && !checkoutDone,
            },
          ]}
        />

        <Progress
          value={progressValue}
          tone={
            checkoutPending
              ? "warning"
              : allRequiredDone
                ? "success"
                : "default"
          }
          className="h-2"
        />

        {state.checklist.items.length > 0 ? (
          <TasksClient
            items={state.checklist.items}
            disabled={checkoutPending || checkoutDone}
            attendanceId={state.attendance?.id ?? null}
            consumptionIngredients={consumptionIngredients}
            consumptionReport={consumptionReport}
            showConsumptionReport={hasConsumptionChecklist}
            countHref={countHref}
          />
        ) : (
          <AppEmptyState
            title={taskCopy.noChecklistTitle}
            description={taskCopy.noChecklistDescription}
            icon={<IconListChecks />}
          />
        )}

        {allRequiredDone && !checkoutPending && !checkoutDone ? (
          <Button asChild size="touch-lg" className="w-full sm:w-fit">
            <Link href={clockHref}>
              <IconClock data-icon="inline-start" />
              {copy.clockOut}
            </Link>
          </Button>
        ) : checkoutPending ? (
          <Button
            variant="outline"
            size="touch-lg"
            className="w-full sm:w-fit"
            disabled
          >
            <IconClock data-icon="inline-start" />
            {copy.checkoutPending}
          </Button>
        ) : null}
      </EmployeePanel>
    </EmployeePage>
  );
}

export default async function EmployeeTasksPage() {
  return <EmployeeTasksPageContent />;
}
