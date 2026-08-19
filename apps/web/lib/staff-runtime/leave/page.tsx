import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  CalendarDays as IconCalendarDays,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { getEmployeeContext } from "../_lib/staff-runtime-context";
import {
  EmployeeMissingProfileEmpty,
  EmployeePage,
} from "../components/staff-runtime-page";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { LeaveRequestClient } from "./leave-client";
import { messages } from "@lib/messages";

const copy = messages.employee.leave;
type LeavePlane = "employee" | "branch";

export async function EmployeeLeavePageContent({
  returnHref,
  routeBranchId,
  hideHeaderOnMobile,
  profileHref,
  plane = "employee",
}: {
  returnHref: string;
  routeBranchId?: number;
  hideHeaderOnMobile?: boolean;
  profileHref: string;
  plane?: LeavePlane;
}) {
  const ctx = await getEmployeeContext();
  const Page = plane === "branch" ? BranchOperatorPage : EmployeePage;
  const mobileTitleBar =
    plane === "branch" ? (
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={<Link href={returnHref} aria-label={ACTIONS_VI.back} />}
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{copy.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {copy.description}
          </p>
        </div>
      </BranchOperatorControlBar>
    ) : null;

  if (!ctx) {
    return (
      <Page
        title={copy.title}
        description={copy.description}
        hideHeaderOnMobile={hideHeaderOnMobile}
      >
        {mobileTitleBar}
        <EmployeeMissingProfileEmpty profileHref={profileHref} />
      </Page>
    );
  }

  const branchId = routeBranchId ?? ctx.branchId;

  let requestsQuery = ctx.supabase
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
  requestsQuery =
    branchId == null
      ? requestsQuery.is("branch_id", null)
      : requestsQuery.eq("branch_id", branchId);
  const { data: requestsData } = await requestsQuery;

  const initialRequests = (requestsData ?? []) as LeaveRequestRow[];

  return (
    <Page
      title={copy.title}
      description={copy.description}
      hideHeaderOnMobile={hideHeaderOnMobile}
      action={
        plane === "employee" ? (
          <Button
            variant="outline"
            size="touch"
            className="w-full sm:w-fit"
            render={<Link href={returnHref} />}
          >
            <IconCalendarDays data-icon="inline-start" />
            {copy.backToSchedule}
          </Button>
        ) : undefined
      }
    >
      {mobileTitleBar}
      <LeaveRequestClient
        branchId={branchId}
        initialRequests={initialRequests}
        plane={plane}
      />
    </Page>
  );
}

export type LeaveRequestStatus =
  "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequestType =
  "annual" | "sick" | "unpaid" | "personal" | "other";

export interface LeaveRequestRow {
  id: number;
  branch_id: number | null;
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
