import {
  LogOut as IconLogout,
  ShieldCheck as IconShieldCheck,
  User as IconUser,
} from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { TrustScoreBadge } from "@/inventory/_components/trust-score-badge";
import { getMyTrustScore } from "@/inventory/trust-actions";
import {
  EmployeeDetailList,
  EmployeePage,
  EmployeePanel,
} from "../components/employee-page";
import { getEmployeeContext } from "../_lib/employee-context";
import { formatDateVN } from "../_lib/vn-business-date";

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

  const trustRes = ctx?.branchId ? await getMyTrustScore(ctx.branchId) : null;
  const trust = trustRes?.success ? trustRes.data : null;

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    "Nhân viên";

  return (
    <EmployeePage
      title="Cá nhân"
      description="Hồ sơ đang dùng cho chấm công, lịch ca và quyền tự phục vụ."
      badge={{ children: roleLabel, variant: "outline" }}
    >
      <EmployeePanel
        icon={IconUser}
        title={displayName}
        description={session.user.email ?? "Chưa có email"}
        tone="info"
      >
        <EmployeeDetailList
          rows={[
            {
              label: BRANCH_VI.long,
              value: ctx?.branchName ?? "Chưa gắn chi nhánh",
              muted: !ctx?.branchName,
            },
            {
              label: "Mã nhân viên",
              value: employee?.employee_code ?? "Chưa có",
              muted: !employee?.employee_code,
            },
            {
              label: "Ngày bắt đầu",
              value: employee?.start_date
                ? formatDateVN(employee.start_date)
                : "Chưa có",
              muted: !employee?.start_date,
            },
          ]}
        />
      </EmployeePanel>

      {trust ? (
        <EmployeePanel
          icon={IconShieldCheck}
          title="Ghi nhận vận hành"
          description="Chỉ hiển thị khi tài khoản có dữ liệu tự xem."
          tone="info"
        >
          <EmployeeDetailList
            columns={1}
            rows={[
              {
                label: "Điểm tin cậy",
                value: (
                  <TrustScoreBadge
                    score={trust.score}
                    computedScore={trust.computedScore}
                  />
                ),
              },
              {
                label: "GRN 30 ngày",
                value: <Badge variant="outline">{trust.grnCount30d}</Badge>,
              },
              ...(trust.varianceIncidents30d > 0
                ? [
                    {
                      label: "Sự cố",
                      value: (
                        <Badge variant="warning">
                          {trust.varianceIncidents30d}
                        </Badge>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </EmployeePanel>
      ) : null}

      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outline">
          <IconLogout data-icon="inline-start" />
          {ACTIONS_VI.signOut}
        </Button>
      </form>
    </EmployeePage>
  );
}
