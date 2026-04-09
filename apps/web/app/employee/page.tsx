import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChefHat,
  CreditCard,
  DoorOpen,
  Home,
  LogOut,
  Monitor,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import { PageContainer, PageHeader } from "@/components/foundation/ui-patterns";

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

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  const roleLabel = ROLE_LABELS[claims.user_role] ?? claims.user_role;

  const canPos = canAccess(claims.user_role, "pos");
  const canKds = canAccess(claims.user_role, "kds");
  const branchId = claims.branch_id;

  let branchName: string | null = null;
  let branchIsHq = false;
  if (branchId) {
    const { data } = await supabase
      .from("branches")
      .select("name, is_headquarters")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchName = data?.name ?? null;
    branchIsHq = data?.is_headquarters === true;
  }

  const posHref = branchId ? `/br/${branchId}/pos` : "/employee";
  const kdsHref = branchId ? `/br/${branchId}/kds` : "/employee";
  const posDisabled = !canPos || !branchId || branchIsHq;
  const kdsDisabled = !canKds || !branchId || branchIsHq;

  return (
    <PageContainer className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <PageHeader title="Xin chào!" description="Cổng nhân viên" />
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{roleLabel}</span>
            </p>
            {branchId && (
              <p className="text-sm text-muted-foreground">
                {branchName ?? `Chi nhánh #${String(branchId)}`}
                {branchIsHq ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (Trụ sở)
                  </span>
                ) : null}
              </p>
            )}
          </div>
        </div>

        <form action="/api/auth/signout" method="post">
          <Button variant="outline" size="sm" className="touch-target">
            <LogOut className="mr-1.5 size-4" />
            Đăng xuất
          </Button>
        </form>
      </div>

      {/* Quick actions */}
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Truy cập nhanh
        </p>
        <div className="flex flex-col gap-3">
          {posDisabled ? (
            <button
              disabled
              className="touch-target-lg flex h-16 cursor-not-allowed items-center gap-4 rounded-xl border border-border bg-muted/40 px-5 opacity-50"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Vào POS</p>
                <p className="text-xs text-muted-foreground">
                  Màn hình bán hàng
                </p>
              </div>
            </button>
          ) : (
            <Link
              href={posHref}
              className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Vào POS</p>
                <p className="text-xs text-muted-foreground">
                  Màn hình bán hàng
                </p>
              </div>
            </Link>
          )}

          {kdsDisabled ? (
            <button
              disabled
              className="touch-target-lg flex h-16 cursor-not-allowed items-center gap-4 rounded-xl border border-border bg-muted/40 px-5 opacity-50"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ChefHat className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Vào KDS</p>
                <p className="text-xs text-muted-foreground">Màn hình bếp</p>
              </div>
            </button>
          ) : (
            <Link
              href={kdsHref}
              className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ChefHat className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Vào KDS</p>
                <p className="text-xs text-muted-foreground">Màn hình bếp</p>
              </div>
            </Link>
          )}
        </div>

        {!branchId && (canPos || canKds) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Tài khoản chưa gắn chi nhánh — liên hệ quản lý để được phân công.
          </p>
        )}
        {branchId && branchIsHq && (canPos || canKds) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Trụ sở không có sàn POS/KDS. Vui lòng dùng trang quản trị.
          </p>
        )}
      </div>

      {/* HR Portal */}
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Nhân sự
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/employee/attendance"
            className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <DoorOpen className="size-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Chấm công</p>
              <p className="text-xs text-muted-foreground">
                Xem lịch sử chấm công của bạn
              </p>
            </div>
          </Link>

          <Link
            href="/employee/payslip"
            className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="size-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Phiếu lương</p>
              <p className="text-xs text-muted-foreground">
                Xem lương & thuế TNCN
              </p>
            </div>
          </Link>

          <div className="flex h-12 items-center gap-3 rounded-lg border border-dashed border-border px-4 text-sm text-muted-foreground">
            <Home className="size-4 shrink-0" />
            Hồ sơ cá nhân (sắp có)
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
