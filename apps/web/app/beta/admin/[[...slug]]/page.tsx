import Link from "next/link";
import { ArrowUpRight, Building2, Receipt, Users } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { type RecentOrder } from "@/admin/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { findAdminBetaRoute, getAdminBetaRouteGroups, getSiblingRoutes } from "../../_lib/routes";
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
    <Card className="border-border/60 bg-card/90">
      <CardHeader>
        <Badge variant="secondary" className="w-fit rounded-full bg-primary/10 px-3 py-1 text-primary">
          Dữ liệu thật
        </Badge>
        <CardTitle className="font-heading text-4xl">Nhịp đơn hàng gần đây</CardTitle>
        <CardDescription className="text-base leading-7">
          Dùng cùng nguồn dữ liệu với admin dashboard hiện tại để giữ tín hiệu thật trong beta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? (
          <div className="rounded-3xl border border-border/60 bg-muted/35 px-4 py-4 text-sm text-muted-foreground">
            Chưa có đơn hàng gần đây trong phạm vi role hiện tại.
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className="grid gap-3 rounded-3xl border border-border/60 bg-background/80 px-4 py-4 md:grid-cols-[1.2fr_1fr_auto]"
            >
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {order.branch_name}
                </p>
                <p className="mt-1 text-lg font-medium text-foreground">{order.order_number}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </Badge>
                <Badge variant="secondary" className="rounded-full bg-muted px-3 py-1">
                  {order.payment_status ?? "Chưa thu"}
                </Badge>
              </div>
              <div className="text-left md:text-right">
                <p className="font-heading text-3xl text-foreground">
                  {formatVND(order.total_amount)}
                </p>
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
    ? getSiblingRoutes(
        getAdminBetaRouteGroups(),
        route.section,
        route.pattern,
        "/beta/admin",
      )
    : [];

  const title = route?.title ?? "Route quản trị beta";
  const description =
    route?.description ??
    "Route này chưa có profile beta riêng, nhưng vẫn được giữ trong cây mirror để deep-link không bị đứt.";
  const legacyHref =
    route?.legacyHref ?? `/admin/${slug.join("/")}`.replace(/\/$/, "");

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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
        <RecentOrdersPanel orders={summary.stats.recentOrders} />

        <Card className="border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-4xl">Cross-surface</CardTitle>
            <CardDescription className="text-base leading-7">
              Những nhịp liên quan trực tiếp đến lớp quản trị đang được giữ kết nối trong beta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                description: "Khi bạn cần workflow đầy đủ của bề mặt hiện tại.",
              },
              {
                href: "/beta/admin/staff",
                icon: Users,
                title: "Nhân sự nền beta",
                description: "Route mirror của staff trong shell beta mới.",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-3xl border border-border/60 bg-background/75 px-4 py-3 transition-colors hover:bg-muted"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                  <item.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{item.title}</span>
                  <span className="block text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
