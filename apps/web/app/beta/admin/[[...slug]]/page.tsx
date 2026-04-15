import Link from "next/link";
import { ArrowUpRight, Building2, Receipt, Users } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { type RecentOrder } from "@/admin/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  findAdminBetaRoute,
  getAdminBetaRouteGroups,
  getSiblingRoutes,
} from "../../_lib/routes";
import { loadBetaAdminSummary } from "../../_lib/admin-data";
import { RouteScaffold } from "../../_components/route-scaffold";

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ",
  in_progress: "Đang làm",
  ready: "Sẵn sàng",
  completed: "Hoàn thành",
  cancelled: "Huỷ",
};

function RecentOrdersPanel({ orders }: { orders: RecentOrder[] }) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          Dữ liệu thật
        </Badge>
        <CardTitle>Đơn hàng gần đây</CardTitle>
        <CardDescription>Dùng cùng nguồn dữ liệu với admin dashboard hiện tại.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? (
          <div className="rounded-md border bg-muted px-4 py-4 text-sm text-muted-foreground">
            Chưa có đơn hàng gần đây trong phạm vi role hiện tại.
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="grid gap-3 rounded-md border px-4 py-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">{order.branch_name}</p>
                <p className="font-medium text-foreground">{order.order_number}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
                <Badge variant="secondary">{order.payment_status ?? "Chưa thu"}</Badge>
              </div>
              <div className="text-left md:text-right">
                <p className="font-medium text-foreground">{formatVND(order.total_amount)}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default async function BetaAdminRoutePage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const route = findAdminBetaRoute(slug);
  const summary = await loadBetaAdminSummary();

  const related = route
    ? getSiblingRoutes(getAdminBetaRouteGroups(), route.section, route.pattern, "/beta/admin")
    : [];

  const title = route?.title ?? "Route quản trị beta";
  const description =
    route?.description ??
    "Route này chưa có profile beta riêng, nhưng vẫn được giữ trong cây mirror để deep-link không bị đứt.";
  const legacyHref = route?.legacyHref ?? `/admin/${slug.join("/")}`.replace(/\/$/, "");

  return (
    <div className="space-y-6">
      <RouteScaffold
        eyebrow={route?.section ?? "Điều hành quản trị"}
        title={title}
        description={description}
        legacyHref={legacyHref || "/admin/dashboard"}
        status={route?.availability ?? "transition"}
        related={related}
        summary={[
          {
            label: "Doanh thu hôm nay",
            value: formatVND(summary.stats.todayRevenue),
            detail: "Tổng doanh thu của ngày hiện tại trong phạm vi role.",
          },
          {
            label: "Đơn hôm nay",
            value: String(summary.stats.todayOrders),
            detail: "Số đơn đã ghi nhận trong ngày theo bối cảnh quyền hiện tại.",
          },
          {
            label: "Chi nhánh thấy được",
            value: String(summary.branchCount),
            detail: "Số chi nhánh nằm trong phạm vi role hiện tại.",
          },
          {
            label: "Nhân sự thấy được",
            value: String(summary.staffCount),
            detail: "Số hồ sơ nhân sự nằm trong phạm vi role hiện tại.",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentOrdersPanel orders={summary.stats.recentOrders} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cross-surface</CardTitle>
            <CardDescription>Các đường đi nhanh thường dùng từ admin beta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              {
                href: "/beta/inventory",
                icon: Building2,
                title: "Mở kho beta",
                description: "Đi thẳng sang inventory surface mới.",
              },
              {
                href: "/admin/dashboard",
                icon: Receipt,
                title: "Về dashboard hiện tại",
                description: "Khi cần workflow đầy đủ của bề mặt hiện tại.",
              },
              {
                href: "/beta/admin/staff",
                icon: Users,
                title: "Nhân sự nền beta",
                description: "Route mirror của staff trong beta.",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "default" }),
                  "h-auto w-full justify-between px-4 py-3",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <item.icon className="size-4" />
                  <span>
                    <span className="block font-medium text-foreground">{item.title}</span>
                    <span className="block text-sm text-muted-foreground">{item.description}</span>
                  </span>
                </span>
                <ArrowUpRight className="size-4" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
