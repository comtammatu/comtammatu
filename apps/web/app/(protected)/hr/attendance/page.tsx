import Link from "next/link";
import { redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNDateString, getVNMonthString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { StaffCheckoutApprovalsPageContent } from "@lib/staff-runtime/checkout-approvals/page";
import { AttendanceTable } from "./attendance-table";
import {
  AttendanceTabSync,
  type AttendanceTab,
} from "../attendance-tab-sync";
import { LeaveRequestsTable } from "../leave-requests-table";
import type { BranchOption } from "../_types";
import { loadOwnerRosterPanelData } from "@lib/hr/roster/load-owner-roster-data";
import { RosterWeekClient } from "@lib/hr/roster/roster-week-client";
import {
  getHrScopeBranchId,
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

type AttendanceSearchParams = {
  branch?: string;
  day?: string;
  employee?: string;
  filter?: string;
  month?: string;
  panel?: string;
  tab?: string;
  view?: string;
  week?: string;
};

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

function resolveTab(value: string | undefined): AttendanceTab {
  if (value === "leave" || value === "schedule") return "approvals";
  if (value === "attendance") return "timesheet";
  if (
    value === "today" ||
    value === "approvals" ||
    value === "timesheet" ||
    value === "roster"
  ) {
    return value;
  }
  return "today";
}

export default async function HrAttendancePage({
  searchParams,
}: {
  searchParams: Promise<AttendanceSearchParams>;
}) {
  const { supabase, claims } = await loadAuthState();
  const params = await searchParams;
  const [{ data }, canForceClose, canCorrect] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_FORCE_CLOSE_ATTENDANCE,
      null,
    ),
    probePermission(
      { supabase, claims },
      PERMISSION_KEYS.HR_CORRECT_ATTENDANCE,
      null,
    ),
  ]);
  const branches = (data ?? []) as BranchOption[];
  const branchScope = resolveHrBranchScope(params.branch, branches);
  const branchId = getHrScopeBranchId(branchScope);
  const legacyTab =
    params.tab === "attendance"
      ? "timesheet"
      : params.tab === "leave" || params.tab === "schedule"
        ? "approvals"
        : null;
  if (legacyTab) {
    const next = new URLSearchParams({ branch: branchScope, tab: legacyTab });
    if (legacyTab === "timesheet") {
      for (const key of ["month", "view", "day", "employee", "filter"] as const) {
        if (params[key]) next.set(key, params[key]);
      }
    }
    redirect(`/hr/attendance?${next.toString()}`);
  }
  const storeBranches = branches.filter(
    (branch) => (branch.branch_kind ?? "branch") === "branch",
  );
  const canLoadCheckoutApprovals =
    branchScope === "all" || branchId != null;
  let leaveCountQuery = supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "pending");
  let checkoutCountQuery = supabase
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", claims.tenant_id)
    .not("checkout_requested_at", "is", null)
    .is("checkout_approved_at", null)
    .is("check_out", null);
  if (branchId != null) {
    leaveCountQuery = leaveCountQuery.eq("branch_id", branchId);
    checkoutCountQuery = checkoutCountQuery.eq("branch_id", branchId);
  } else if (branchScope === "office") {
    leaveCountQuery = leaveCountQuery.is("branch_id", null);
    checkoutCountQuery = checkoutCountQuery.is("branch_id", null);
  }
  const [leaveCountResult, checkoutCountResult] = await Promise.all([
    leaveCountQuery,
    checkoutCountQuery,
  ]);
  const pendingApprovals =
    (leaveCountResult.count ?? 0) + (checkoutCountResult.count ?? 0);
  const month = resolveMonth(params.month);
  const today = getVNDateString();
  const todayMonth = today.slice(0, 7);
  const initialView =
    params.view === "calendar" || params.view === "clock"
      ? params.view
      : "summary";
  const copy = messages.hr.client;
  const tab = resolveTab(params.tab);
  const rosterPanel =
    tab === "roster" && branchScope !== "all"
      ? await loadOwnerRosterPanelData(branches, branchScope, params.week)
      : null;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.tabs.attendance}
        description={copy.attendanceDescription}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="touch"
              render={<Link href={withHrBranchScope("/hr", branchScope)} />}
            >
              {messages.hr.payroll.backToHr}
            </Button>
          </div>
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
        defaultValue="today"
        ariaLabel={copy.attendanceTabs.ariaLabel}
        queryKeysByValue={{
          today: ["branch"],
          approvals: ["branch", "panel"],
          timesheet: [
            "branch",
            "month",
            "view",
            "day",
            "employee",
            "filter",
          ],
          roster: ["branch", "week"],
        }}
      >
        <AttendanceTabSync serverTab={tab}>
          {tab === "today" ? (
            <TabsContent value="today">
              <AttendanceTable
                key={branchScope}
                branches={branches}
                initialBranchId={branchId ?? undefined}
                initialBranchScope={branchScope}
                initialMonth={todayMonth}
                initialView="clock"
                initialDay={today}
                initialEmployeeId={null}
                initialCalendarScope="all"
                urlTab="today"
                todayMode
                canForceClose={canForceClose}
                canCorrect={canCorrect}
              />
            </TabsContent>
          ) : null}
          {tab === "approvals" ? (
            <TabsContent value="approvals">
              <div className="flex flex-col gap-4">
                <AppSection
                  title={copy.checkoutApprovalsAction}
                  description={copy.checkoutApprovalsHint}
                  contentFlush
                >
                  {canLoadCheckoutApprovals ? (
                    <StaffCheckoutApprovalsPageContent
                      routeBranchId={branchId}
                      ownerHomeHref={withHrBranchScope(
                        "/hr/attendance?tab=approvals",
                        branchScope,
                      )}
                      embedded
                    />
                  ) : (
                    <AppEmptyState mode="no-data" />
                  )}
                </AppSection>
                <AppSection
                  title={messages.hr.leave.approvalsTitle}
                  description={messages.hr.leave.approvalsDescription}
                  contentFlush
                >
                  <LeaveRequestsTable
                    branches={storeBranches}
                    branchScope={branchScope}
                    historyPanelOpen={params.panel === "leave-history"}
                  />
                </AppSection>
              </div>
            </TabsContent>
          ) : null}
          {tab === "timesheet" ? (
            <TabsContent value="timesheet">
              <AttendanceTable
                key={branchScope}
                branches={branches}
                initialBranchId={branchId ?? undefined}
                initialBranchScope={branchScope}
                initialMonth={month}
                initialView={initialView}
                initialDay={
                  initialView === "calendar"
                    ? resolveDay(params.day, month)
                    : null
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
                canForceClose={canForceClose}
                canCorrect={canCorrect}
              />
            </TabsContent>
          ) : null}
          {tab === "roster" ? (
            <TabsContent value="roster">
              {branchScope === "all" ? (
                <AppEmptyState
                  mode="no-results"
                  title={messages.hr.roster.scopeRequiredTitle}
                  description={messages.hr.roster.scopeRequiredDescription}
                />
              ) : rosterPanel ? (
                <RosterWeekClient
                  branchId={rosterPanel.branchId}
                  weekStart={rosterPanel.weekStart}
                  data={rosterPanel.roster}
                  canAssign={rosterPanel.canAssign}
                  loadFailed={rosterPanel.loadFailed}
                  urlTab="roster"
                />
              ) : null}
            </TabsContent>
          ) : null}
        </AttendanceTabSync>
      </AppPageTabs>
    </AppPage>
  );
}
