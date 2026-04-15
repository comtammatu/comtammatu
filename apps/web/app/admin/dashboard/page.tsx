import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  CircleAlert,
  DollarSign,
  LayoutTemplate,
  Monitor,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  UtensilsCrossed,
  Warehouse,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { formatVND } from "@comtammatu/shared/format";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/foundation/ui-patterns";
import { fetchDashboardStats } from "./actions";

interface StatCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
}

interface SurfaceCardProps {
  title: string;
  description?: string;
  href: string;
  badge: string;
  icon: React.ElementType;
}

function StatCard({ title, value, change, icon: Icon }: StatCardProps) {
  const isPositive = change >= 0;

  return (
    <Card className="rounded-lg border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        <StatusBadge
          tone={isPositive ? "success" : "danger"}
          className="mt-3 inline-flex items-center gap-1"
        >
          {isPositive ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )}
          {Math.abs(change).toFixed(1)}% so với hôm qua
        </StatusBadge>
      </CardContent>
    </Card>
  );
}

function SurfaceCard({
  title,
  description,
  href,
  badge,
  icon: Icon,
}: SurfaceCardProps) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <StatusBadge tone="neutral" className="rounded-full px-3 py-1">
            {badge}
          </StatusBadge>
        </div>
        <div>
          <p className="text-base font-semibold tracking-tight">{title}</p>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <span className="mt-5 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
        Mở phân hệ
      </span>
    </Link>
  );
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ",
  in_progress: "Đang làm",
  ready: "Sẵn sàng",
  completed: "Hoàn thành",
  cancelled: "Hủy",
};

const ORDER_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  in_progress: "default",
  ready: "default",
  completed: "outline",
  cancelled: "destructive",
};

function computeChange(today: number, yesterday: number): number {
  if (yesterday === 0) return today > 0 ? 100 : 0;
  return ((today - yesterday) / yesterday) * 100;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    redirect(buildLoginBlockedStatePath());
  }

  const stats = await fetchDashboardStats();
  const revenueChange = computeChange(
    stats.todayRevenue,
    stats.yesterdayRevenue,
  );
  const ordersChange = computeChange(stats.todayOrders, stats.yesterdayOrders);
  const yesterdayAvg =
    stats.yesterdayOrders > 0
      ? stats.yesterdayRevenue / stats.yesterdayOrders
      : 0;
  const avgChange = computeChange(stats.avgOrderValue, yesterdayAvg);

  const foundationCards: SurfaceCardProps[] = [];
  if (canAccess(claims.user_role, "settings")) {
    foundationCards.push({
      title: "Thiết lập hệ thống",
      href: "/admin/settings",
      badge: "Nền tảng",
      icon: Settings,
    });
  }
  if (canAccess(claims.user_role, "staff")) {
    foundationCards.push({
      title: "Nhân sự nền",
      href: "/admin/staff",
      badge: "Nền tảng",
      icon: ShieldCheck,
    });
  }

  const domainCards: SurfaceCardProps[] = [];
  if (canAccess(claims.user_role, "menu")) {
    domainCards.push({
      title: "Thực đơn",
      href: "/admin/menu",
      badge: "Phân hệ ERP",
      icon: LayoutTemplate,
    });
  }
  if (canAccess(claims.user_role, "inventory")) {
    domainCards.push({
      title: "Điều hành kho",
      href: "/inventory",
      badge: "Phân hệ ERP",
      icon: Warehouse,
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    domainCards.push({
      title: "Nhân sự & lương",
      href: "/hr",
      badge: "Phân hệ ERP",
      icon: Briefcase,
    });
  }
  if (claims.branch_id != null && canAccess(claims.user_role, "pos")) {
    domainCards.push({
      title: `POS chi nhánh #${claims.branch_id}`,
      href: `/br/${claims.branch_id}/pos`,
      badge: "Phân hệ ERP",
      icon: Monitor,
    });
  }
  if (claims.branch_id != null && canAccess(claims.user_role, "kds")) {
    domainCards.push({
      title: `KDS chi nhánh #${claims.branch_id}`,
      href: `/br/${claims.branch_id}/kds`,
      badge: "Phân hệ ERP",
      icon: UtensilsCrossed,
    });
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={APP_COPY_VI.adminFoundation}
        title="Admin"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/settings">Nền tảng</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/reports">{APP_COPY_VI.executiveReporting}</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Doanh thu hôm nay"
          value={formatVND(stats.todayRevenue)}
          change={revenueChange}
          icon={DollarSign}
        />
        <StatCard
          title="Đơn bán hôm nay"
          value={String(stats.todayOrders)}
          change={ordersChange}
          icon={Receipt}
        />
        <StatCard
          title="Giá trị trung bình/đơn"
          value={formatVND(Math.round(stats.avgOrderValue))}
          change={avgChange}
          icon={TrendingUp}
        />
      </div>

      {foundationCards.length > 0 ? (
        <SectionCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Nền tảng
              </h2>
            </div>
            <StatusBadge tone="neutral" className="rounded-full px-3 py-1.5">
              {foundationCards.length} mục
            </StatusBadge>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {foundationCards.map((card) => (
              <SurfaceCard key={card.href} {...card} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      {domainCards.length > 0 ? (
        <SectionCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Phân hệ ERP
              </h2>
            </div>
            <StatusBadge tone="info" className="rounded-full px-3 py-1.5">
              {domainCards.length} phân hệ
            </StatusBadge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {domainCards.map((card) => (
              <SurfaceCard key={card.href} {...card} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      {stats.recentOrders.length > 0 ? (
        <SectionCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Tín hiệu bán hàng gần đây
              </h2>
            </div>
            <StatusBadge tone="success" className="rounded-full px-3 py-1.5">
              Tín hiệu
            </StatusBadge>
          </div>
          <Card className="overflow-hidden border-border/70 bg-card shadow-none">
            <CardContent className="p-0">
              <ul className="divide-y divide-border/60">
                {stats.recentOrders.map((order) => (
                  <li
                    key={order.id}
                    className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        #{order.order_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.branch_name} · {formatTime(order.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge
                        tone={
                          order.status === "cancelled"
                            ? "danger"
                            : order.status === "ready"
                              ? "success"
                              : order.status === "in_progress"
                                ? "info"
                                : "neutral"
                        }
                        className={cn(
                          ORDER_STATUS_VARIANT[order.status] === "outline" &&
                            "bg-background text-foreground",
                        )}
                      >
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </StatusBadge>
                      <span className="min-w-20 text-right text-sm font-semibold tabular-nums">
                        {formatVND(order.total_amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </SectionCard>
      ) : (
        <EmptyState
          icon={<CircleAlert className="size-5" />}
          title="Chưa có tín hiệu bán hàng mới"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/reports/revenue">Mở báo cáo doanh thu</Link>
            </Button>
          }
          density="touch"
        />
      )}
    </PageContainer>
  );
}
