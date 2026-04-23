import Link from "next/link";
import {
  IconArrowDown,
  IconArrowUp,
  IconBriefcase,
  IconAlertCircle,
  IconCurrencyDollar,
  IconLayoutDashboard,
  IconDeviceDesktop,
  IconReceipt,
  IconSettings,
  IconShieldCheck,
  IconTrendingUp,
  IconToolsKitchen,
  IconWallet,
  IconBuildingWarehouse,
} from "@tabler/icons-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { canAccess } from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { loadAuthState } from "@/_lib/auth";
import {
  SurfaceLinkCard,
  type SurfaceLinkCardProps,
} from "../../components/surface-link-card";
import { fetchDashboardStats } from "./actions";

interface StatCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
}

function StatCard({ title, value, change, icon: Icon }: StatCardProps) {
  const isPositive = change >= 0;

  return (
    <Card className="rounded-lg border bg-muted/30 text-card-foreground transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md">
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
            <IconArrowUp className="size-3" />
          ) : (
            <IconArrowDown className="size-3" />
          )}
          {Math.abs(change).toFixed(1)}% so với hôm qua
        </Badge>
      </CardContent>
    </Card>
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
  const { claims } = await loadAuthState();

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

  const foundationCards: SurfaceLinkCardProps[] = [];
  if (canAccess(claims.user_role, "settings")) {
    foundationCards.push({
      title: "Thiết lập hệ thống",
      href: "/admin/settings",
      badge: "Quản lý",
      icon: IconSettings,
    });
  }
  if (canAccess(claims.user_role, "staff")) {
    foundationCards.push({
      title: "Nhân viên",
      href: "/admin/staff",
      badge: "Quản lý",
      icon: IconShieldCheck,
    });
  }

  const domainCards: SurfaceLinkCardProps[] = [];
  if (canAccess(claims.user_role, "menu")) {
    domainCards.push({
      title: "Thực đơn",
      href: "/menu",
      badge: "Vận hành",
      icon: IconLayoutDashboard,
    });
  }
  if (canAccess(claims.user_role, "inventory")) {
    domainCards.push({
      title: "Điều hành kho",
      href: "/inventory",
      badge: "Vận hành",
      icon: IconBuildingWarehouse,
    });
  }
  if (canAccess(claims.user_role, "finance")) {
    domainCards.push({
      title: "Tài chính",
      href: "/finance",
      badge: "Vận hành",
      icon: IconWallet,
    });
  }
  if (canAccess(claims.user_role, "hr")) {
    domainCards.push({
      title: "Nhân sự & lương",
      href: "/hr",
      badge: "Vận hành",
      icon: IconBriefcase,
    });
  }
  if (claims.branch_id != null && canAccess(claims.user_role, "pos")) {
    domainCards.push({
      title: `POS chi nhánh #${claims.branch_id}`,
      href: `/br/${claims.branch_id}/pos`,
      badge: "Vận hành",
      icon: IconDeviceDesktop,
    });
  }
  if (claims.branch_id != null && canAccess(claims.user_role, "kds")) {
    domainCards.push({
      title: `KDS chi nhánh #${claims.branch_id}`,
      href: `/br/${claims.branch_id}/kds`,
      badge: "Vận hành",
      icon: IconToolsKitchen,
    });
  }

  const hasQuickAccess = foundationCards.length > 0 || domainCards.length > 0;

  const recentOrdersCard = stats.recentOrders.length > 0 ? (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Đơn hàng gần đây</CardTitle>
          <p className="text-sm text-muted-foreground">
            Theo dõi nhanh các đơn vừa phát sinh trong cửa hàng.
          </p>
        </div>
        <Badge variant="success" className="rounded-full px-3 py-1.5">
          Mới nhất
        </Badge>
      </CardHeader>
      <CardContent>
        <Card className="overflow-hidden rounded-lg border bg-muted/30 text-card-foreground shadow-none">
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {stats.recentOrders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      #{order.order_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.branch_name} · {formatTime(order.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
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
                    <span className="text-sm font-semibold tabular-nums sm:min-w-20 sm:text-right">
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
          <IconAlertCircle className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-2xl font-semibold">Chưa có đơn hàng mới</h3>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reports/revenue">Mở báo cáo doanh thu</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Trung tâm điều hành
          </p>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Tổng quan vận hành hôm nay
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Doanh thu, đơn bán và các mục quản lý quan trọng được đặt cùng
              một chỗ để theo dõi và mở nhanh trong ngày.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1.5">
            {foundationCards.length} mục quản lý
          </Badge>
          <Badge variant="info" className="rounded-full px-3 py-1.5">
            {domainCards.length} mục vận hành
          </Badge>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Doanh thu hôm nay"
          value={formatVND(stats.todayRevenue)}
          change={revenueChange}
          icon={IconCurrencyDollar}
        />
        <StatCard
          title="Đơn bán hôm nay"
          value={String(stats.todayOrders)}
          change={ordersChange}
          icon={IconReceipt}
        />
        <StatCard
          title="Giá trị trung bình/đơn"
          value={formatVND(Math.round(stats.avgOrderValue))}
          change={avgChange}
          icon={IconTrendingUp}
        />
      </div>

      <div
        className={cn(
          "grid gap-4",
          hasQuickAccess && "xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]",
        )}
      >
        <div className="space-y-4">{recentOrdersCard}</div>

        {hasQuickAccess ? (
          <div className="space-y-4">
            {foundationCards.length > 0 ? (
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Quản lý</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Các mục cấu hình và quản lý dùng hằng ngày.
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="rounded-full px-3 py-1.5"
                  >
                    {foundationCards.length} mục
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {foundationCards.map((card) => (
                      <SurfaceLinkCard
                        key={card.href}
                        {...card}
                        ctaLabel="Mở mục này"
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {domainCards.length > 0 ? (
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Vận hành</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Mở nhanh kho, nhân sự, POS, KDS và thực đơn.
                    </p>
                  </div>
                  <Badge variant="info" className="rounded-full px-3 py-1.5">
                    {domainCards.length} mục
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {domainCards.map((card) => (
                      <SurfaceLinkCard
                        key={card.href}
                        {...card}
                        ctaLabel="Mở mục này"
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
