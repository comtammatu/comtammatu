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
import { cn, getSurfacePanelClassName } from "@comtammatu/ui";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  ROLE_LABEL_VI,
  extractClaims,
  canAccess,
} from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  PageContainer,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/foundation/ui-patterns";

function ActionLink({
  href,
  title,
  description,
  icon,
  badge,
}: {
  href: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={getSurfacePanelClassName(
        "employee",
        "group touch-target-lg focus-ring-standard flex items-center gap-4 rounded-3xl p-4 transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-white/92",
      )}
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {badge ? (
            <span className="rounded-full border border-primary/15 bg-primary/8 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {badge}
            </span>
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
  );
}

function DisabledPanel({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        getSurfacePanelClassName("employee"),
        "flex items-center gap-4 rounded-3xl border-dashed bg-muted/30 p-4 shadow-none",
      )}
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
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
    <PageContainer className="space-y-6" density="compact">
      <SectionCard className="overflow-hidden" surface="employee">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <PageHeader
              eyebrow="Trang chủ nhân viên"
              title="Bắt đầu ca làm việc"
              surface="employee"
              density="compact"
            />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="info">
                {branchName ?? "Chưa gắn chi nhánh"}
              </StatusBadge>
              <StatusBadge tone={branchIsHq ? "warning" : "success"}>
                {branchIsHq ? "Đang ở trụ sở" : "Chi nhánh vận hành"}
              </StatusBadge>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="app-kpi">
              <p className="app-section-label">Vai trò</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {ROLE_LABEL_VI[claims.user_role]}
              </p>
            </div>
            <div className="app-kpi">
              <p className="app-section-label">Ca làm</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                Sẵn sàng vào ca
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard surface="employee">
          <div className="space-y-4">
            <div>
              <p className="app-section-label">Việc trong ngày</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Bắt đầu ca
              </h2>
            </div>
            <div className="grid gap-3">
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
            </div>
          </div>
        </SectionCard>

        <SectionCard surface="employee">
          <div className="space-y-4">
            <div>
              <p className="app-section-label">Không gian làm việc</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Theo vai trò hiện tại
              </h2>
            </div>
            <div className="grid gap-3">
              {posDisabled ? (
                <DisabledPanel
                  title="POS chưa sẵn sàng"
                  description={
                    !branchId
                      ? "Tài khoản chưa được gắn chi nhánh làm việc."
                      : branchIsHq
                        ? "Trụ sở không dùng quầy POS."
                        : "Vai trò hiện tại không dùng POS."
                  }
                  icon={<Monitor className="size-5" />}
                />
              ) : (
                <ActionLink
                  href={posHref}
                  title="Vào POS"
                  icon={<Monitor className="size-5" />}
                  badge="Vận hành"
                />
              )}

              {kdsDisabled ? (
                <DisabledPanel
                  title="KDS chưa sẵn sàng"
                  description={
                    !branchId
                      ? "Tài khoản chưa được gắn chi nhánh làm việc."
                      : branchIsHq
                        ? "Trụ sở không có line bếp để thao tác."
                        : "Vai trò hiện tại không dùng KDS."
                  }
                  icon={<ChefHat className="size-5" />}
                />
              ) : (
                <ActionLink
                  href={kdsHref}
                  title="Vào KDS"
                  icon={<ChefHat className="size-5" />}
                  badge="Bếp"
                />
              )}

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
                <p className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                  Chưa gắn chi nhánh. Liên hệ quản lý.
                </p>
              )}
              {branchId && branchIsHq && (canPos || canKds) && (
                <p className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                  Trụ sở không dùng POS/KDS.
                </p>
              )}

            </div>
          </div>
        </SectionCard>
      </div>

      <form action="/api/auth/signout" method="post">
        <Button
          type="submit"
          variant="outline"
          className="focus-ring-standard inline-flex items-center gap-2 rounded-full border-border/70 bg-white/72 px-4 text-muted-foreground hover:bg-white hover:text-foreground"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </Button>
      </form>
    </PageContainer>
  );
}
