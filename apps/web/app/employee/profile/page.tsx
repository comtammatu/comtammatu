import { redirect } from "next/navigation";
import {
  LogOut,
  User,
  Building2,
  CalendarDays,
  BadgeCheck,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
  ROLE_LABEL_VI,
} from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  PageContainer,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/foundation/ui-patterns";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect(buildLoginBlockedStatePath());

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;

  // Get employee record
  const { data: employee } = await supabase
    .from("employees")
    .select("employee_code, start_date")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  // Get branch name
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
    <PageContainer className="mx-auto max-w-3xl" density="compact">
      <SectionCard surface="employee" density="compact">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <User className="size-8" />
            </div>
            <div className="space-y-1">
              <p className="app-section-label">Thông tin cá nhân</p>
              <p className="text-xl font-semibold text-foreground">{displayName}</p>
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            </div>
          </div>
          <StatusBadge tone="info">{roleLabel}</StatusBadge>
        </div>
      </SectionCard>

      <PageHeader
        title="Hồ sơ đang dùng"
        surface="employee"
        density="compact"
      />

      <div className="grid gap-3">
        {branchName && (
          <SectionCard surface="employee" density="compact">
            <div className="flex items-center gap-3">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Chi nhánh</p>
                <p className="text-sm font-medium">{branchName}</p>
              </div>
            </div>
          </SectionCard>
        )}

        {employee?.employee_code && (
          <SectionCard surface="employee" density="compact">
            <div className="flex items-center gap-3">
              <BadgeCheck className="size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Mã nhân viên</p>
                <p className="text-sm font-medium">{employee.employee_code}</p>
              </div>
            </div>
          </SectionCard>
        )}

        {employee?.start_date && (
          <SectionCard surface="employee" density="compact">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Ngày bắt đầu</p>
                <p className="text-sm font-medium">{employee.start_date}</p>
              </div>
            </div>
          </SectionCard>
        )}
      </div>

      <form action="/api/auth/signout" method="post">
        <Button
          type="submit"
          variant="outline"
          className="focus-ring-standard inline-flex items-center justify-center gap-2 rounded-full border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </Button>
      </form>
    </PageContainer>
  );
}
