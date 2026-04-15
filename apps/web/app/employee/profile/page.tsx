import { redirect } from "next/navigation";
import { BadgeCheck, Building2, CalendarDays, LogOut, User } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
  ROLE_LABEL_VI,
} from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect(buildLoginBlockedStatePath());

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;

  const { data: employee } = await supabase
    .from("employees")
    .select("employee_code, start_date")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  let branchName: string | null = null;
  if (claims.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select("name")
      .eq("id", claims.branch_id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchName = data?.name ?? null;
  }

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    "Nhân viên";

  return (
    <div className="space-y-6 p-5 md:p-6">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <User className="size-8" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Thông tin cá nhân
                </p>
                <p className="text-xl font-semibold text-foreground">{displayName}</p>
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
              </div>
            </div>
            <Badge variant="info">{roleLabel}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Hồ sơ đang dùng</CardTitle>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {branchName && (
          <Card>
            <CardContent className="space-y-1.5 p-4">
              <div className="flex items-center gap-3">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Chi nhánh</p>
                  <p className="text-sm font-medium">{branchName}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {employee?.employee_code && (
          <Card>
            <CardContent className="space-y-1.5 p-4">
              <div className="flex items-center gap-3">
                <BadgeCheck className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Mã nhân viên</p>
                  <p className="text-sm font-medium">{employee.employee_code}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {employee?.start_date && (
          <Card>
            <CardContent className="space-y-1.5 p-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Ngày bắt đầu</p>
                  <p className="text-sm font-medium">{employee.start_date}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outline" className="gap-2">
          <LogOut className="size-4" />
          Đăng xuất
        </Button>
      </form>
    </div>
  );
}
