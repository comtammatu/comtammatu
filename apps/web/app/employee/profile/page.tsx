import { redirect } from "next/navigation";
import {
  LogOut,
  User,
  Building2,
  CalendarDays,
  BadgeCheck,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

const ROLE_LABELS: Record<string, string> = {
  owner: "Chủ hệ thống",
  super_manager: "Quản lý tổng",
  area_manager: "Quản lý khu vực",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Bếp",
  office: "Văn phòng",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  const roleLabel = ROLE_LABELS[claims.user_role] ?? claims.user_role;

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
    <div className="flex flex-col gap-6">
      {/* Profile header */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div className="flex size-20 items-center justify-center rounded-full bg-primary/10">
          <User className="size-10 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">{displayName}</p>
          <p className="text-sm text-muted-foreground">{roleLabel}</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="flex flex-col gap-2">
        {branchName && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Chi nhánh</p>
              <p className="text-sm font-medium">{branchName}</p>
            </div>
          </div>
        )}

        {employee?.employee_code && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <BadgeCheck className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Mã nhân viên</p>
              <p className="text-sm font-medium">{employee.employee_code}</p>
            </div>
          </div>
        )}

        {employee?.start_date && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Ngày bắt đầu</p>
              <p className="text-sm font-medium">{employee.start_date}</p>
            </div>
          </div>
        )}
      </div>

      {/* Coming soon */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Sắp có
        </p>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex h-12 items-center gap-3 rounded-lg border border-dashed border-border px-4">
            Phiếu lương chi tiết
          </div>
          <div className="flex h-12 items-center gap-3 rounded-lg border border-dashed border-border px-4">
            Cập nhật hồ sơ cá nhân
          </div>
        </div>
      </div>

      {/* Logout */}
      <form action="/api/auth/signout" method="post" className="mt-4">
        <button
          type="submit"
          className="focus-ring-standard flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </button>
      </form>
    </div>
  );
}
