import Link from "next/link";
import { ArrowDown as IconArrowDown, ArrowUp as IconArrowUp, Briefcase as IconBriefcase, DollarSign as IconCurrencyDollar, LayoutDashboard as IconLayoutDashboard, Monitor as IconDeviceDesktop, Receipt as IconReceipt, Settings as IconSettings, ShieldCheck as IconShieldCheck, TrendingUp as IconTrendingUp, Utensils as IconToolsKitchen, Wallet as IconWallet, Warehouse as IconBuildingWarehouse } from "lucide-react";
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
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@comtammatu/ui/components/empty";
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        <Badge
          variant={isPositive ? "success" : "destructive"}
          className="mt-2 inline-flex items-center gap-1"
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
  completed: "Hòan thành",
  cancelled: "Hủy",
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

  const quickLinks = [
    { title: "Nhân viên", href: "/admin/staff", icon: IconShieldCheck, moduleKey: "staff" as const },
    { title: "Thiết lập", href: "/admin/settings", icon: IconSettings, moduleKey: "settings" as const },
    { title: "Thực đơn", href: "/menu", icon: IconLayoutDashboard, moduleKey: "menu" as const },
    { title: "Điều hành kho", href: "/inventory", icon: IconBuildingWarehouse, moduleKey: "inventory" as const },
    { title: "Tài chính", href: "/finance", icon: IconWallet, moduleKey: "finance" as const },
    { title: "Nhân sự & lương", href: "/hr", icon: IconBriefcase, moduleKey: "hr" as const },
  ].filter((link) => canAccess(claims.user_role, link.moduleKey));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
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

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,320px)]">
        <Card>
          <CardHeader>
            <CardTitle>Đơn hàng gần đây</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length > 0 ? (
              <ul className="divide-y divide-border">
                {stats.recentOrders.map((order) => (
                  <li
                    key={order.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        #{order.order_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.branch_name} · {formatTime(order.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
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
                      >
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                      <span className="text-sm font-medium tabular-nums">
                        {formatVND(order.total_amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Chưa có đơn hàng mới</EmptyTitle>
                  <EmptyDescription>
                    Đơn hàng bán trong ngày sẽ xuất hiện tại đây.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Truy cập nhanh
          </p>
          <div className="grid gap-2">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.href}
                  asChild
                  variant="outline"
                  className="h-auto justify-start gap-3 px-3 py-2.5"
                >
                  <Link href={link.href}>
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{link.title}</span>
                  </Link>
                </Button>
              );
            })}
            {claims.branch_id != null && canAccess(claims.user_role, "pos") && (
              <Button
                asChild
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-2.5"
              >
                <Link href={`/br/${claims.branch_id}/pos`}>
                  <IconDeviceDesktop className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">POS chi nhánh #{claims.branch_id}</span>
                </Link>
              </Button>
            )}
            {claims.branch_id != null && canAccess(claims.user_role, "kds") && (
              <Button
                asChild
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-2.5"
              >
                <Link href={`/br/${claims.branch_id}/kds`}>
                  <IconToolsKitchen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">KDS chi nhánh #{claims.branch_id}</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
