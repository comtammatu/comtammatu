import { BadgeCheck as IconRosetteDiscountCheck, Building as IconBuilding, CalendarDays as IconCalendarEvent, LogOut as IconLogout, User as IconUser, ShieldCheck as IconShieldCheck } from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { loadAuthState } from "@/_lib/auth";
import { getEmployeeContext } from "../_lib/employee-context";
import { getMyTrustScore } from "@/inventory/trust-actions";
import { TrustScoreBadge } from "@/inventory/_components/trust-score-badge";

import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
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

  // Self-view trust score. Only meaningful for branch-scoped users.
  const trustRes = ctx?.branchId
    ? await getMyTrustScore(ctx.branchId)
    : null;
  const trust = trustRes?.success ? trustRes.data : null;

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    "Nhân viên";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <IconUser className="size-8" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  Thông tin cá nhân
                </p>
                <p className="text-xl font-semibold text-foreground">
                  {displayName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {session.user.email}
                </p>
              </div>
            </div>
            <Badge variant="info">{roleLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Hồ sơ đang dùng</CardTitle>
          <CardDescription>
            Thông tin nhân viên gắn với tài khoản này.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {ctx?.branchName ? (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <IconBuilding />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{BRANCH_VI.long}</ItemTitle>
                  <p className="text-sm font-medium">{ctx.branchName}</p>
                </ItemContent>
              </Item>
            ) : null}

            {employee?.employee_code ? (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <IconRosetteDiscountCheck />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Mã nhân viên</ItemTitle>
                  <p className="text-sm font-medium">
                    {employee.employee_code}
                  </p>
                </ItemContent>
              </Item>
            ) : null}

            {employee?.start_date ? (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <IconCalendarEvent />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Ngày bắt đầu</ItemTitle>
                  <p className="text-sm font-medium">{employee.start_date}</p>
                </ItemContent>
              </Item>
            ) : null}

            {trust ? (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <IconShieldCheck />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Điểm tin cậy</ItemTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <TrustScoreBadge
                      score={trust.score}
                      computedScore={trust.computedScore}
                      withTooltip
                    />
                    <span className="text-xs text-muted-foreground">
                      GRN 30 ngày: {trust.grnCount30d}
                      {trust.varianceIncidents30d > 0
                        ? ` · Incident: ${trust.varianceIncidents30d}`
                        : ""}
                    </span>
                  </div>
                </ItemContent>
              </Item>
            ) : null}
          </ItemGroup>
        </CardContent>
      </Card>

      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outline">
          <IconLogout data-icon="inline-start" />
          {ACTIONS_VI.signOut}
        </Button>
      </form>
    </div>
  );
}
