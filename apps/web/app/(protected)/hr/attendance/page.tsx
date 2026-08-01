import Link from "next/link";
import { getVNDateString, getVNMonthString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";
import { AttendanceTable } from "../attendance-table";
import { LeaveRequestsTable } from "../leave-requests-table";
import type { BranchOption } from "../_types";
import { loadOwnerRosterPanelData } from "@lib/hr/roster/load-owner-roster-data";
import { RosterWeekClient } from "@lib/hr/roster/roster-week-client";

type AttendanceSearchParams = {
  branch?: string;
  day?: string;
  employee?: string;
  filter?: string;
  month?: string;
  tab?: string;
  view?: string;
  week?: string;
};

type AttendanceTab = "today" | "approvals" | "timesheet" | "roster";

function resolveMonth(value: string | undefined) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "")
    ? value!
    : getVNMonthString();
}

function resolveDay(value: string | undefined, month: string) {
  if (!value?.startsWith(`${month}-`)) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value ? value : null;
}

function resolveEmployeeId(value: string | undefined) {
  const employeeId = Number(value);
  return Number.isSafeInteger(employeeId) && employeeId > 0 ? employeeId : null;
}

function resolveCalendarScope(value: string | undefined) {
  return value === "attention" ? "attention" : "all";
}

function resolveTab(
  value: string | undefined,
  pendingApprovals: number,
): AttendanceTab {
  if (value === "leave" || value === "schedule") return "approvals";
  if (value === "attendance") return "timesheet";
  if (value === "today" || value === "approvals" || value === "timesheet" || value === "roster") {
    return value;
  }
  return pendingApprovals > 0 ? "approvals" : "today";
}

export default async function HrAttendancePage({
  searchParams,
}: {
  searchParams: Promise<AttendanceSearchParams>;
}) {
  const { supabase, claims } = await loadAuthState();
  const params = await searchParams;
  const [{ data }, leaveCountResult, checkoutCountResult] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "pending"),
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", claims.tenant_id)
      .not("checkout_requested_at", "is", null)
      .is("checkout_approved_at", null)
      .is("check_out", null),
  ]);
  const branches = (data ?? []) as BranchOption[];
  const storeBranches = branches.filter(
    (branch) => (branch.branch_kind ?? "branch") === "branch",
  );
  const pendingApprovals =
    (leaveCountResult.count ?? 0) + (checkoutCountResult.count ?? 0);
  const month = resolveMonth(params.month);
  const today = getVNDateString();
  const todayMonth = today.slice(0, 7);
  const requestedBranchId = Number(params.branch);
  const initialBranchId = branches.some(
    (branch) => branch.id === requestedBranchId,
  )
    ? requestedBranchId
    : branches[0]?.id;
  const initialView =
    params.view === "calendar" || params.view === "clock"
      ? params.view
      : "summary";
  const copy = messages.hr.client;
  const tab = resolveTab(params.tab, pendingApprovals);
  const rosterPanel =
    tab === "roster"
      ? await loadOwnerRosterPanelData(
          branches,
          params.branch,
          params.week,
        )
      : null;

  return (
    <AppPage width="xwide">
      <AppPageHeader
        title={copy.tabs.attendance}
        description={copy.attendanceDescription}
        actions={
          <Button variant="outline" size="touch" render={<Link href="/hr" />}>
            {messages.hr.payroll.backToHr}
          </Button>
        }
      />
      <AppPageTabs
        items={[
          { value: "today", label: copy.attendanceTabs.today },
          {
            value: "approvals",
            label: copy.attendanceTabs.approvals,
            count: pendingApprovals > 0 ? pendingApprovals : undefined,
          },
          { value: "timesheet", label: copy.attendanceTabs.timesheet },
          { value: "roster", label: copy.attendanceTabs.roster },
        ]}
        defaultValue={tab}
        ariaLabel={copy.attendanceTabs.ariaLabel}
      >
        <TabsContent value="today">
          <AttendanceTable
            branches={branches}
            initialBranchId={initialBranchId}
            initialMonth={todayMonth}
            initialView="clock"
            initialDay={today}
            initialEmployeeId={null}
            initialCalendarScope="all"
            urlTab="today"
            todayMode
          />
        </TabsContent>
        <TabsContent value="approvals">
          <div className="flex flex-col gap-4">
            <AppSection
              title={copy.checkoutApprovalsAction}
              description={copy.checkoutApprovalsHint}
              contentFlush
            >
              <StaffCheckoutApprovalsPageContent
                routeBranchId={null}
                ownerHomeHref="/hr/attendance?tab=approvals"
                embedded
              />
            </AppSection>
            <LeaveRequestsTable branches={storeBranches} />
          </div>
        </TabsContent>
        <TabsContent value="timesheet">
          <AttendanceTable
            branches={branches}
            initialBranchId={initialBranchId}
            initialMonth={month}
            initialView={initialView}
            initialDay={
              initialView === "calendar" ? resolveDay(params.day, month) : null
            }
            initialEmployeeId={
              initialView === "calendar"
                ? resolveEmployeeId(params.employee)
                : null
            }
            initialCalendarScope={
              initialView === "calendar"
                ? resolveCalendarScope(params.filter)
                : "all"
            }
            urlTab="timesheet"
          />
        </TabsContent>
        <TabsContent value="roster">
          {rosterPanel ? (
            <RosterWeekClient
              branchId={rosterPanel.branchId}
              siteOptions={rosterPanel.siteOptions}
              weekStart={rosterPanel.weekStart}
              data={rosterPanel.roster}
              canAssign={rosterPanel.canAssign}
              loadFailed={rosterPanel.loadFailed}
              urlTab="roster"
            />
          ) : null}
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
