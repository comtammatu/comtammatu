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
import { Card } from "@comtammatu/ui/components/card";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";

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
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const claims = extractClaims(user.app_metadata);
  if (!claims) redirect("/login");

  const roleLabel = ROLE_LABELS[claims.user_role] ?? claims.user_role;

  const canPos = canAccess(claims.user_role, "pos");
  const canKds = canAccess(claims.user_role, "kds");
  const branchId = claims.branch_id;
  const posHref = branchId ? `/br/${branchId}/pos` : "/employee";
  const kdsHref = branchId ? `/br/${branchId}/kds` : "/employee";
  const posDisabled = !canPos || !branchId;
  const kdsDisabled = !canKds || !branchId;

  let branchName: string | null = null;
  if (branchId) {
    const { data } = await supabase
      .from("branches")
      .select("name")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchName = data?.name ?? null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Cổng nhân viên</p>
          <h1 className="mt-1 text-lg font-semibold">Xin chào</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vai trò:{" "}
            <span className="font-medium text-foreground">{roleLabel}</span>
            {branchId ? (
              <>
                {" "}
                · Chi nhánh:{" "}
                <span className="font-medium text-foreground">
                  {branchName ?? `#${String(branchId)}`}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <form action="/api/auth/signout" method="post">
          <Button variant="outline" size="sm" className="h-8">
            <LogOut className="mr-1 size-3" />
            Đăng xuất
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Home className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Lối tắt</p>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {posDisabled ? (
              <Button disabled>
                <Monitor className="mr-2 size-4" />
                Vào POS
              </Button>
            ) : (
              <Button asChild>
                <Link href={posHref}>
                  <Monitor className="mr-2 size-4" />
                  Vào POS
                </Link>
              </Button>
            )}

            {kdsDisabled ? (
              <Button variant="secondary" disabled>
                <ChefHat className="mr-2 size-4" />
                Vào KDS
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href={kdsHref}>
                  <ChefHat className="mr-2 size-4" />
                  Vào KDS
                </Link>
              </Button>
            )}
          </div>
          {!branchId && (canPos || canKds) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Tài khoản chưa gắn chi nhánh.
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Sắp có</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <DoorOpen className="size-4" />
              Ca làm việc & chấm công
            </li>
            <li className="flex items-center gap-2">
              <DoorOpen className="size-4" />
              Lương & thuế TNCN
            </li>
            <li className="flex items-center gap-2">
              <DoorOpen className="size-4" />
              Hồ sơ cá nhân
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
