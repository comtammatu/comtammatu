import {
  ArrowDown,
  ArrowUp,
  DollarSign,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { formatVND } from "@comtammatu/shared/format";

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
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${isPositive ? "text-emerald-600" : "text-destructive"}`}
        >
          {isPositive ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )}
          {Math.abs(change)}% so với hôm qua
        </p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Tổng quan hoạt động kinh doanh
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Doanh thu hôm nay"
          value={formatVND(12450000)}
          change={12.5}
          icon={DollarSign}
        />
        <StatCard
          title="Đơn hàng"
          value="48"
          change={8.3}
          icon={Receipt}
        />
        <StatCard
          title="Khách hàng mới"
          value="12"
          change={-5.2}
          icon={Users}
        />
        <StatCard
          title="Trung bình/đơn"
          value={formatVND(259375)}
          change={3.1}
          icon={TrendingUp}
        />
      </div>
    </div>
  );
}
