import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { AttendanceTable } from "../attendance-table";
import { LeaveRequestsTable } from "../leave-requests-table";
import type { BranchOption } from "../_types";

export default async function HrAttendancePage() {
  const { supabase, claims } = await loadAuthState();
  const { data } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  const branches = (data ?? []) as BranchOption[];
  const copy = messages.hr.client;

  return (
    <AppPage width="xwide">
      <AppPageHeader
        eyebrow={messages.hr.workspace.eyebrow}
        title={copy.tabs.attendance}
        description={copy.attendanceDescription}
        actions={
          <Button variant="outline" size="sm" render={<Link href="/hr" />}>
            {messages.hr.payroll.backToHr}
          </Button>
        }
      />
      <AppSection title={copy.attendanceTitle} contentFlush contentScroll>
        <AttendanceTable branches={branches} />
      </AppSection>
      <AppSection
        title={messages.hr.leave.approvalsTitle}
        description={messages.hr.leave.approvalsDescription}
        contentFlush
        contentScroll
      >
        <LeaveRequestsTable branches={branches} />
      </AppSection>
    </AppPage>
  );
}
