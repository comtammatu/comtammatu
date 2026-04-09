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
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  const canPos = canAccess(claims.user_role, "pos");
  const canKds = canAccess(claims.user_role, "kds");
  const branchId = claims.branch_id;

  let branchIsHq = false;
  if (branchId) {
    const { data } = await supabase
      .from("branches")
      .select("is_headquarters")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchIsHq = data?.is_headquarters === true;
  }

  const posHref = branchId ? `/br/${branchId}/pos` : "/employee";
  const kdsHref = branchId ? `/br/${branchId}/kds` : "/employee";
  const posDisabled = !canPos || !branchId || branchIsHq;
  const kdsDisabled = !canKds || !branchId || branchIsHq;

  return (
    <div className="flex flex-col gap-6">
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
            href="/employee/clock"
            className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <DoorOpen className="size-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Chấm công</p>
              <p className="text-xs text-muted-foreground">
                Chấm công vào/ra ca làm việc
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

      {/* Logout */}
      <form action="/api/auth/signout" method="post" className="mt-2">
        <button
          type="submit"
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          Đăng xuất
        </button>
      </form>
    </div>
  );
}
