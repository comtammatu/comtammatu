import {
  ArrowDown,
  ArrowUp,
  DollarSign,
  Receipt,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
import { formatVND } from "@comtammatu/shared/format";
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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight tabular-nums">
          {value}
        </p>
        <div
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
        >
          {isPositive ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )}
          {Math.abs(change).toFixed(1)}% so với hôm qua
        </div>
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
  const stats = await fetchDashboardStats();

  const revenueChange = computeChange(
    stats.todayRevenue,
    stats.yesterdayRevenue,
  );
  const ordersChange = computeChange(stats.todayOrders, stats.yesterdayOrders);

  // avg order value change: compare today avg vs yesterday avg
  const yesterdayAvg =
    stats.yesterdayOrders > 0
      ? stats.yesterdayRevenue / stats.yesterdayOrders
      : 0;
  const avgChange = computeChange(stats.avgOrderValue, yesterdayAvg);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tổng quan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tổng quan hoạt động kinh doanh hôm nay
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Doanh thu hôm nay"
          value={formatVND(stats.todayRevenue)}
          change={revenueChange}
          icon={DollarSign}
        />
        <StatCard
          title="Đơn hàng"
          value={String(stats.todayOrders)}
          change={ordersChange}
          icon={Receipt}
        />
        <StatCard
          title="Trung bình/đơn"
          value={formatVND(Math.round(stats.avgOrderValue))}
          change={avgChange}
          icon={TrendingUp}
        />
      </div>

      {stats.recentOrders.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">
            Đơn hàng gần đây
          </h2>
          <Card>
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
                          ORDER_STATUS_VARIANT[order.status] ?? "secondary"
                        }
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
        </div>
      )}
    </div>
  );
}
