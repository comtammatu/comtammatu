import Link from "next/link";
import {
  Camera as IconCamera,
  CheckCircle2 as IconDone,
  Clock as IconClock,
  ListChecks as IconListChecks,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  EmployeeDetailList,
  EmployeeMissingProfileEmpty,
  EmployeePage,
  EmployeePanel,
} from "../components/employee-page";
import { formatTimeVN } from "../_lib/vn-business-date";
import { getTodayWorkState } from "../_lib/today-work-state";
import { TasksClient } from "./tasks-client";

const copy = messages.employee.home;

export default async function EmployeeTasksPage() {
  const state = await getTodayWorkState();

  if (state.status === "missing_profile") {
    return (
      <EmployeePage title="Việc trong ca" description="Checklist ca làm hôm nay">
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  if (state.status === "not_started" || state.status === "missing_branch") {
    return (
      <EmployeePage title="Việc trong ca" description="Checklist ca làm hôm nay">
        <EmployeePanel
          icon={IconCamera}
          title="Chưa vào ca"
          description="Chấm công vào trước khi mở việc trong ca."
          tone="warning"
          badge={{ children: "Chưa vào ca", variant: "warning" }}
        >
          <EmployeeDetailList
            rows={[
              {
                label: copy.branch,
                value: state.branchName ?? copy.noBranch,
                muted: !state.branchName,
              },
            ]}
            columns={1}
          />
          {state.status === "missing_branch" ? null : (
            <Button asChild size="touch" className="w-full sm:w-fit">
              <Link href="/employee/clock">
                <IconCamera data-icon="inline-start" />
                Chấm công vào
              </Link>
            </Button>
          )}
        </EmployeePanel>
      </EmployeePage>
    );
  }

  const allDone = state.checklist.remaining === 0;
  const badge = allDone
    ? { children: "Đã xong", variant: "success" as const }
    : {
        children: `${state.checklist.remaining} chưa làm`,
        variant: "warning" as const,
      };

  return (
    <EmployeePage
      title="Việc trong ca"
      description="Checklist ca làm hôm nay"
      action={
        allDone ? (
          <Button asChild size="touch" className="w-full sm:w-fit">
            <Link href="/employee/clock">
              <IconClock data-icon="inline-start" />
              Kết ca làm
            </Link>
          </Button>
        ) : null
      }
    >
      <EmployeePanel
        icon={allDone ? IconDone : IconListChecks}
        title="Checklist"
        description={
          allDone
            ? "Tất cả việc trong ca đã xong."
            : "Tích xong từng việc để mở kết ca."
        }
        tone={allDone ? "success" : "info"}
        badge={badge}
      >
        <EmployeeDetailList
          rows={[
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
        />

        {state.checklist.items.length > 0 ? (
          <TasksClient items={state.checklist.items} />
        ) : (
          <div className="text-sm text-muted-foreground">
            Chưa có checklist cho ca này.
          </div>
        )}
      </EmployeePanel>
    </EmployeePage>
  );
}
