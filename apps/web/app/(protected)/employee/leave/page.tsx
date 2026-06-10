import Link from "next/link";
import { User as IconUser } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { getEmployeeContext } from "../_lib/employee-context";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/employee-page";
import { LeaveRequestClient } from "./leave-client";
import { messages } from "@lib/messages";

const copy = messages.employee.leave;

export default async function EmployeeLeavePage() {
  const ctx = await getEmployeeContext();
  if (!ctx) {
    return (
      <EmployeePage title={copy.title} description={copy.description}>
        <EmployeeMissingProfileEmpty />
      </EmployeePage>
    );
  }

  if (!ctx.branchId) {
    return (
      <EmployeePage title={copy.unavailableTitle} description={copy.description}>
        <EmployeeMissingProfileEmpty
          title={copy.unavailableTitle}
          description={copy.missingBranchDescription}
        />
      </EmployeePage>
    );
  }

  const { data: requestsData } = await ctx.supabase
    .from("leave_requests")
    .select(
      `
      id, branch_id, employee_id, status, start_date, end_date, leave_type,
      reason, rejected_reason, created_at, reviewed_at
    `,
    )
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("employee_id", ctx.employeeId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  const initialRequests = (requestsData ?? []) as LeaveRequestRow[];

  return (
    <EmployeePage
      title={copy.title}
      description={copy.description}
      action={
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href="/employee/profile">
            <IconUser data-icon="inline-start" />
            {copy.backToProfile}
          </Link>
        </Button>
      }
    >
      <LeaveRequestClient
        branchId={ctx.branchId}
        branchName={ctx.branchName}
        initialRequests={initialRequests}
      />
    </EmployeePage>
  );
}

export type LeaveRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type LeaveRequestType =
  | "annual"
  | "sick"
  | "unpaid"
  | "personal"
  | "other";

export interface LeaveRequestRow {
  id: number;
  branch_id: number;
  employee_id: number;
  status: LeaveRequestStatus;
  start_date: string;
  end_date: string;
  leave_type: LeaveRequestType;
  reason: string | null;
  rejected_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}
