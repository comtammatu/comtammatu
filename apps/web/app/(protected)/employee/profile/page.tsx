import { LogOut as IconLogout, User as IconUser } from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  EmployeeDetailList,
  EmployeePage,
  EmployeePanel,
} from "../components/employee-page";
import { getEmployeeContext } from "../_lib/employee-context";
import { formatDateVN } from "../_lib/vn-business-date";

const copy = messages.employee.profile;

export default async function ProfilePage() {
  const { session, claims } = await loadAuthState();
  const ctx = await getEmployeeContext();

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;

  const { data: employee } = ctx
    ? await ctx.supabase
        .from("employees")
        .select("employee_code, start_date")
        .eq("id", ctx.employeeId)
        .eq("tenant_id", claims.tenant_id)
        .maybeSingle()
    : { data: null };

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    copy.fallbackName;

  return (
    <EmployeePage
      title={copy.title}
      description={copy.description}
      badge={{ children: roleLabel, variant: "outline" }}
    >
      <EmployeePanel
        icon={IconUser}
        title={displayName}
        description={session.user.email ?? copy.noEmail}
        tone="info"
      >
        <EmployeeDetailList
          rows={[
            {
              label: BRANCH_VI.long,
              value: ctx?.branchName ?? copy.noBranch,
              muted: !ctx?.branchName,
            },
            {
              label: copy.employeeCode,
              value: employee?.employee_code ?? copy.noEmployeeCode,
              muted: !employee?.employee_code,
            },
            {
              label: copy.startDate,
              value: employee?.start_date
                ? formatDateVN(employee.start_date)
                : copy.noStartDate,
              muted: !employee?.start_date,
            },
          ]}
        />
      </EmployeePanel>

      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outline" size="touch">
          <IconLogout data-icon="inline-start" />
          {ACTIONS_VI.signOut}
        </Button>
      </form>
    </EmployeePage>
  );
}
