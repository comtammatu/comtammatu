import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { getVNMonthString } from "@comtammatu/shared/time";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { AttendanceTable } from "../attendance-table";
import { LeaveRequestsTable } from "../leave-requests-table";
import type { BranchOption } from "../_types";

type AttendanceSearchParams = {
  branch?: string;
  day?: string;
  employee?: string;
  filter?: string;
  month?: string;
  tab?: string;
  view?: string;
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

export default async function HrAttendancePage({
  searchParams,
}: {
  searchParams: Promise<AttendanceSearchParams>;
}) {
  const { supabase, claims } = await loadAuthState();
  const params = await searchParams;
  const { data } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  const branches = (data ?? []) as BranchOption[];
  const month = resolveMonth(params.month);
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
          { value: "attendance", label: copy.tabs.attendance },
          { value: "leave", label: messages.hr.leave.approvalsTitle },
        ]}
        defaultValue={params.tab === "leave" ? "leave" : "attendance"}
      >
        <TabsContent value="attendance">
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
          />
        </TabsContent>
        <TabsContent value="leave">
          <LeaveRequestsTable branches={branches} />
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
