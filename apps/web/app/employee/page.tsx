import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  ChefHat,
  CreditCard,
  DoorOpen,
  LayoutDashboard,
  LogOut,
  Monitor,
  UserRound,
  Warehouse,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  ROLE_LABEL_VI,
  extractClaims,
  canAccess,
} from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";

function ActionLink({
  href,
  title,
  description,
  icon,
  badge,
  disabled,
}: {
  href: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <Card className="app-subpanel">
        <CardContent className="space-y-1.5 p-4">
          <div className="flex items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {description ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="app-subpanel">
      <CardContent className="p-1">
        <Button
          asChild
          variant="ghost"
          className="group h-auto w-full justify-start rounded-2xl p-0"
        >
          <Link href={href} className="flex min-h-16 w-full items-center gap-4 px-3 py-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {icon}
            </span>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                {badge ? (
                  <Badge variant="warning" className="h-5 rounded-full">
                    {badge}
                  </Badge>
                ) : null}
              </div>
              {description ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ActionNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="app-subpanel">
      <CardContent className="space-y-1.5 p-4">
        <div className="flex items-start gap-2">
          <Badge variant="warning">{title}</Badge>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect(buildLoginBlockedStatePath());

  const canPos = canAccess(claims.user_role, "pos");
  const canKds = canAccess(claims.user_role, "kds");
  const branchId = claims.branch_id;

  let branchIsHq = false;
  let branchName: string | null = null;
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
  const canDashboard = canAccess(claims.user_role, "dashboard");
  const canInventory = canAccess(claims.user_role, "inventory");
  const canReports = canAccess(claims.user_role, "reports");
  const canHr = canAccess(claims.user_role, "hr");

  const managementLinks = [
    canDashboard
      ? {
          href: "/admin/dashboard",
          title: "Quản trị",
          icon: <LayoutDashboard className="size-5" />,
        }
      : null,
    canInventory
      ? {
          href: "/inventory",
          title: "Kho hàng",
          icon: <Warehouse className="size-5" />,
        }
      : null,
    canReports
      ? {
          href: "/admin/reports",
          title: "Báo cáo",
          icon: <BarChart3 className="size-5" />,
        }
      : null,
    canHr
      ? {
          href: "/hr",
          title: "Nhân sự & tiền lương",
          icon: <Briefcase className="size-5" />,
        }
      : null,
  ].filter(Boolean) as Array<{
    href: string;
    title: string;
    icon: React.ReactNode;
  }>;

  return (
    <div className="space-y-6">
      <Card className="app-panel overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4">
              <span className="app-kicker">Trang chủ nhân viên</span>
              <div className="space-y-3">
                <CardTitle className="font-heading text-3xl sm:text-4xl">
                  Bắt đầu ca làm việc bằng một mặt bằng UI hoàn toàn mới.
                </CardTitle>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Không dùng lại khung cũ. Các tác vụ hằng ngày, lối vào workspace và trạng thái vận hành giờ nằm trong một flow mới, rõ hơn và giàu nhịp hơn.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">
                  {branchName ?? "Chưa gắn chi nhánh"}
                </Badge>
                <Badge variant={branchIsHq ? "warning" : "success"}>
                  {branchIsHq ? "Đang ở trụ sở" : "Chi nhánh vận hành"}
                </Badge>
                <Badge variant="outline">{ROLE_LABEL_VI[claims.user_role]}</Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <Card className="app-subpanel">
                <CardContent className="space-y-1.5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Vai trò
                  </p>
                  <p className="font-heading text-2xl font-semibold text-foreground">
                    {ROLE_LABEL_VI[claims.user_role]}
                  </p>
                </CardContent>
              </Card>
              <Card className="app-subpanel">
                <CardContent className="space-y-1.5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Ca làm
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    Sẵn sàng vào ca
                  </p>
                </CardContent>
              </Card>
              <Card className="app-subpanel">
                <CardContent className="space-y-1.5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Vị trí
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {branchIsHq ? "Trụ sở" : "Chi nhánh"}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="app-panel">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Việc trong ngày
            </p>
            <CardTitle className="mt-2 font-heading text-2xl">Bắt đầu ca</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActionLink
              href="/employee/clock"
              title="Chấm công"
              icon={<DoorOpen className="size-5" />}
              badge="Hôm nay"
            />
            <ActionLink
              href="/employee/schedule"
              title="Lịch ca"
              icon={<CalendarDays className="size-5" />}
            />
            <ActionLink
              href="/employee/payslip"
              title="Phiếu lương"
              icon={<CreditCard className="size-5" />}
            />
            <ActionLink
              href="/employee/profile"
              title="Cá nhân"
              icon={<UserRound className="size-5" />}
            />
          </CardContent>
        </Card>

        <Card className="app-panel">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Không gian làm việc
            </p>
            <CardTitle className="mt-2 font-heading text-2xl">
              Theo vai trò hiện tại
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActionLink
              href={posHref}
              title="POS"
              description={posDisabled ? "Vô hiệu hóa theo vai trò/chi nhánh" : undefined}
              icon={<Monitor className="size-5" />}
              badge={posDisabled ? undefined : "Vận hành"}
              disabled={posDisabled}
            />
            <ActionLink
              href={kdsHref}
              title="KDS"
              description={kdsDisabled ? "Vô hiệu hóa theo vai trò/chi nhánh" : undefined}
              icon={<ChefHat className="size-5" />}
              badge={kdsDisabled ? undefined : "Bếp"}
              disabled={kdsDisabled}
            />

            {managementLinks.map((link) => (
              <ActionLink
                key={link.href}
                href={link.href}
                title={link.title}
                icon={link.icon}
                badge="Quản lý"
              />
            ))}

            {!branchId && (canPos || canKds) && (
              <ActionNotice
                title="Thông tin"
                description="Chưa gắn chi nhánh. Liên hệ quản lý."
              />
            )}
            {branchId && branchIsHq && (canPos || canKds) && (
              <ActionNotice
                title="Thông tin"
                description="Trụ sở không dùng POS/KDS."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <form action="/api/auth/signout" method="post" className="flex justify-start">
        <Button type="submit" variant="outline" className="gap-2 rounded-full px-4">
          <LogOut className="size-4" />
          Đăng xuất
        </Button>
      </form>
    </div>
  );
}
