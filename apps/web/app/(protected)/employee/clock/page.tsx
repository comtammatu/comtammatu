import Link from "next/link";
import { ListChecks as IconListChecks } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { getTodayWorkState } from "../_lib/today-work-state";
import { ClockClient } from "./clock-client";

const copy = messages.employee.home;

export default async function ClockPage() {
  const state = await getTodayWorkState();

  if (state.status === "missing_profile") {
    return (
      <EmployeePage
        title={copy.clockTodayTitle}
        description={copy.clockLongDescription}
      >
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  return (
    <EmployeePage
      title={copy.clockTodayTitle}
      description={copy.clockLongDescription}
      action={
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href="/employee/tasks">
            <IconListChecks data-icon="inline-start" />
            Việc trong ca
          </Link>
        </Button>
      }
    >
      <ClockClient state={state} />
    </EmployeePage>
  );
}
