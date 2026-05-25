import {
  ArrowDown as IconArrowDown,
  ArrowUp as IconArrowUp,
  DollarSign as IconCurrencyDollar,
  Receipt as IconReceipt,
  TrendingUp as IconTrendingUp,
} from "lucide-react";
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
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
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
  completed: "Hoàn thành",
  cancelled: "Hủy",
};

function computeChange(today: number, yesterday: number): number {
  if (yesterday === 0) return today > 0 ? 100 : 0;
  return ((today - yesterday) / yesterday) * 100;
}

function formatTime(iso: string): string {
  return formatVNTime(iso);
}

export default async function DashboardPage() {
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

  return (
    <AppPage width="wide">
      <AppPageHeader
        title="Tổng quan điều hành"
        description="Doanh thu và đơn hàng hôm nay so với hôm qua."
      />

      <AppSection
        title="Hiệu suất hôm nay"
        contentClassName="grid gap-4 sm:grid-cols-3"
      >
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
    </AppPage>
  );
}
