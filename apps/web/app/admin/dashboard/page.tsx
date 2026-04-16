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
import { Badge } from "@comtammatu/ui/components/badge";
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
    <Card className="rounded-lg border bg-muted/30 text-card-foreground transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-3xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        <Badge
          variant={isPositive ? "success" : "destructive"}
          className="mt-3 inline-flex items-center gap-1"
        >
          {isPositive ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )}
          {Math.abs(change).toFixed(1)}% so với hôm qua
        </Badge>
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
      className="rounded-lg border bg-muted/30 text-card-foreground group flex h-full flex-col justify-between p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {badge}
          </Badge>
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
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {APP_COPY_VI.adminFoundation}
              </span>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Admin
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Buồng lái quản trị đã chuyển sang bố cục mới. Tại đây, các tín
                  hiệu bán hàng và lối vào phân hệ được gom lại theo nhịp điều
                  hành thay vì theo khối cũ.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/settings">Nền tảng</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/admin/reports">
                  {APP_COPY_VI.executiveReporting}
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Nền tảng</CardTitle>
              <p className="text-sm text-muted-foreground">
                Những lớp cấu hình và vận hành lõi đang quyết định nhịp toàn hệ
                thống.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1.5">
              {foundationCards.length} mục
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              {foundationCards.map((card) => (
                <SurfaceCard key={card.href} {...card} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {domainCards.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Phân hệ ERP</CardTitle>
              <p className="text-sm text-muted-foreground">
                Các tuyến thao tác chính để đi tiếp sang kho, nhân sự, POS, KDS
                và thực đơn.
              </p>
            </div>
            <Badge variant="info" className="rounded-full px-3 py-1.5">
              {domainCards.length} phân hệ
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {domainCards.map((card) => (
                <SurfaceCard key={card.href} {...card} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stats.recentOrders.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Tín hiệu bán hàng gần đây</CardTitle>
              <p className="text-sm text-muted-foreground">
                Luồng đơn mới nhất để đọc nhanh các nhịp bán hàng đang diễn ra.
              </p>
            </div>
            <Badge variant="success" className="rounded-full px-3 py-1.5">
              Tín hiệu
            </Badge>
          </CardHeader>
          <CardContent>
            <Card className="rounded-lg border bg-muted/30 text-card-foreground overflow-hidden shadow-none">
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
                        <Badge
                          variant={
                            order.status === "cancelled"
                              ? "destructive"
                              : order.status === "ready"
                                ? "success"
                                : order.status === "in_progress"
                                  ? "info"
                                  : "secondary"
                          }
                          className={cn(
                            ORDER_STATUS_VARIANT[order.status] === "outline" &&
                              "bg-background text-foreground",
                          )}
                        >
                          {ORDER_STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                        <span className="min-w-20 text-right text-sm font-semibold tabular-nums">
                          {formatVND(order.total_amount)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border bg-muted text-primary">
              <CircleAlert className="size-5" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-2xl font-semibold">
                Chưa có tín hiệu bán hàng mới
              </h3>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/reports/revenue">Mở báo cáo doanh thu</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
