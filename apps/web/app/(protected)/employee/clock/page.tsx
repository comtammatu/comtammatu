import Link from "next/link";
import { ListChecks as IconListChecks } from "lucide-react";
import { getEmployeeContext } from "../_lib/employee-context";
import { ClockClient } from "./clock-client";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { Button } from "@comtammatu/ui/components/button";
import { getTodayVN } from "../_lib/vn-business-date";
import { messages } from "@lib/messages";

const copy = messages.employee.home;

export default async function ClockPage() {
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return (
      <EmployeePage
        title={copy.clockTodayTitle}
        description={copy.clockLongDescription}
      >
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  // Get today's attendance status
  const today = getTodayVN();
  const { data: record } = await supabase
    .from("attendance_records")
    .select("check_in, check_out, branch_id, branches ( name )")
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .eq("date", today)
    .maybeSingle();

  // Get active branches with GPS for branch selection
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, latitude, longitude")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const activeBranches = (branches ?? [])
    .filter((b) => b.latitude != null && b.longitude != null)
    .map((b) => ({
      id: b.id,
      name: b.name,
      lat: Number(b.latitude),
      lng: Number(b.longitude),
    }));

  const branchData = record?.branches as unknown as
    | { name: string }
    | null
    | undefined;

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
          <Link href="/employee/attendance">
            <IconListChecks data-icon="inline-start" />
            {copy.attendanceTitle}
          </Link>
        </Button>
      }
    >
      <ClockClient
        initialStatus={{
          clockedIn: !!record?.check_in && !record?.check_out,
          clockedOut: !!record?.check_out,
          checkInTime: record?.check_in ?? null,
          checkOutTime: record?.check_out ?? null,
          branchId: record?.branch_id ?? null,
          branchName: branchData?.name ?? null,
        }}
        branches={activeBranches}
        defaultBranchId={claims.branch_id}
      />
    </EmployeePage>
  );
}
