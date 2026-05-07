import { ArrowDown as IconArrowDown, ArrowUp as IconArrowUp, Briefcase as IconBriefcase, DollarSign as IconCurrencyDollar, LayoutDashboard as IconLayoutDashboard, Monitor as IconDeviceDesktop, Receipt as IconReceipt, Settings as IconSettings, ShieldCheck as IconShieldCheck, TrendingUp as IconTrendingUp, Utensils as IconToolsKitchen, Wallet as IconWallet, Warehouse as IconBuildingWarehouse } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@comtammatu/ui/components/empty";
import { canAccess } from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader, AppSection, AppLinkCard } from "@/components/surface";
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
    { title: "Nhân viên", href: "/admin/staff", icon: IconShieldCheck, description: "Quản lý tài khoản và quyền truy cập", moduleKey: "staff" as const },
    { title: "Thiết lập", href: "/admin/settings", icon: IconSettings, description: "Cấu hình chi nhánh và hệ thống", moduleKey: "settings" as const },
    { title: "Thực đơn", href: "/menu", icon: IconLayoutDashboard, description: "Quản lý món ăn và thực đơn", moduleKey: "menu" as const },
    { title: "Điều hành kho", href: "/inventory", icon: IconBuildingWarehouse, description: "Nhập kho, xuất kho và kiểm kê", moduleKey: "inventory" as const },
    { title: "Tài chính", href: "/finance", icon: IconWallet, description: "Doanh thu, chi phí và hóa đơn", moduleKey: "finance" as const },
    { title: "Nhân sự & lương", href: "/hr", icon: IconBriefcase, description: "Hồ sơ nhân viên và kỳ lương", moduleKey: "hr" as const },
  ].filter((link) => canAccess(claims.user_role, link.moduleKey));

  return (
    <AppPage width="wide">
      <AppPageHeader
        title="Tổng quan điều hành"
        description="Doanh thu và đơn hàng hôm nay so với hôm qua."
      />

      <AppSection title="Hiệu suất hôm nay" contentClassName="grid gap-4 sm:grid-cols-3">
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
      </AppSection>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,340px)]">
        <AppSection title="Đơn hàng gần đây">
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
        </AppSection>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Truy cập nhanh
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {quickLinks.map((link) => {
              const LinkIcon = link.icon;
              return (
                <AppLinkCard
                  key={link.href}
                  href={link.href}
                  title={link.title}
                  description={link.description}
                  icon={<LinkIcon />}
                  ctaLabel="Mở"
                />
              );
            })}
            {claims.branch_id != null && canAccess(claims.user_role, "pos") && (
              <AppLinkCard
                href={`/br/${claims.branch_id}/pos`}
                title={`POS chi nhánh #${claims.branch_id}`}
                description="Màn hình điểm bán hàng"
                icon={<IconDeviceDesktop />}
                ctaLabel="Mở"
              />
            )}
            {claims.branch_id != null && canAccess(claims.user_role, "kds") && (
              <AppLinkCard
                href={`/br/${claims.branch_id}/kds`}
                title={`KDS chi nhánh #${claims.branch_id}`}
                description="Màn hình hiển thị bếp"
                icon={<IconToolsKitchen />}
                ctaLabel="Mở"
              />
            )}
          </div>
        </div>
      </div>
    </AppPage>
  );
}
