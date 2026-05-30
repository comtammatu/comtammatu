import Link from "next/link";
import { CalendarDays as IconCalendarEvent } from "lucide-react";
import { addVNDateDays, getVNDateString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { getEmployeeContext } from "../_lib/employee-context";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { ShiftRegisterClient } from "./shift-register-client";
import { messages } from "@lib/messages";

const copy = messages.employee.home;

export default async function EmployeeShiftRegisterPage() {
  const ctx = await getEmployeeContext();
  if (!ctx) {
    return (
      <EmployeePage
        title={copy.shiftRegisterPageTitle}
        description={copy.shiftRegisterLongDescription}
      >
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId, branchId } = ctx;

  // Branches the employee can register at:
  // - Primary: their assigned branch (claims.branch_id)
  // - Fallback: all active branches in tenant (employees without a fixed
  //   branch can still register, but UI will pick the only one or show all).
  const { data: branchesData } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const allBranches = (branchesData ?? []) as { id: number; name: string }[];
  const branches = branchId
    ? allBranches.filter((b) => b.id === branchId)
    : allBranches;

  const todayIso = getVNDateString();
  const horizonIso = addVNDateDays(todayIso, 21);

  // Read own existing requests in the [today, +21d] horizon.
  const { data: requestsData } = await supabase
    .from("shift_requests")
    .select(
      `
      id, status, date, note, created_at, rejected_reason,
      shift_id, branch_id,
      shifts ( id, name, start_time, end_time )
    `,
    )
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", todayIso)
    .lte("date", horizonIso)
    .order("date", { ascending: true });

  const initialRequests = (requestsData ?? []) as unknown as InitialRequest[];

  return (
    <EmployeePage
      title={copy.shiftRegisterPageTitle}
      description={copy.shiftRegisterLongDescription}
      action={
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href="/employee/schedule">
            <IconCalendarEvent data-icon="inline-start" />
            {copy.viewSchedule}
          </Link>
        </Button>
      }
    >
      <ShiftRegisterClient
        branches={branches}
        defaultBranchId={branchId ?? branches[0]?.id ?? null}
        initialRequests={initialRequests}
      />
    </EmployeePage>
  );
}

export interface InitialRequest {
  id: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  date: string;
  note: string | null;
  created_at: string;
  rejected_reason: string | null;
  shift_id: number;
  branch_id: number;
  shifts: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
}
