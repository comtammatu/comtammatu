import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AppPage, AppPageHeader } from "@/components/surface";
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
        defaultValue="attendance"
      >
        <TabsContent value="attendance">
          <AttendanceTable branches={branches} />
        </TabsContent>
        <TabsContent value="leave">
          <LeaveRequestsTable branches={branches} />
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
