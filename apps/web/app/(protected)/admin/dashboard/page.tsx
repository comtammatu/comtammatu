import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown as IconArrowDown,
  ArrowUp as IconArrowUp,
  BarChart3 as IconBarChart,
  Briefcase as IconBriefcase,
  DollarSign as IconCurrencyDollar,
  MessageSquare as IconMessageSquare,
  Package as IconPackage,
  Receipt as IconReceipt,
  Settings as IconSettings,
  TrendingUp as IconTrendingUp,
  Users as IconUsers,
  Wallet as IconWallet,
} from "lucide-react";
import { cn } from "@comtammatu/ui/lib/utils";
import { canAccess, MODULE_ACL } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import {
  SurfaceLinkCard,
  type SurfaceLinkCardProps,
} from "@/components/surface-link-card";
import { fetchDashboardStats } from "./actions";

interface StatCardProps {
  title: string;
  value: string;
  change: number;
  helper: string;
  icon: ElementType;
}

type RecentOrders = Awaited<
  ReturnType<typeof fetchDashboardStats>
>["recentOrders"];
type RecentOrder = RecentOrders[number];

type ActionTone = "primary" | "success" | "warning" | "info" | "secondary";

const ACTION_TONE_CLASSNAME: Record<ActionTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  secondary: "bg-secondary text-secondary-foreground",
};

function ChangeBadge({ change }: { change: number }) {
  const isPositive = change >= 0;

  return (
    <Badge
      variant={
        change === 0 ? "secondary" : isPositive ? "success" : "destructive"
      }
      className="inline-flex items-center gap-1"
    >
      {change !== 0 ? (
        isPositive ? (
          <IconArrowUp className="size-3" />
        ) : (
          <IconArrowDown className="size-3" />
        )
      ) : null}
      {ADMIN_DASHBOARD_COPY.changeFromYesterday(Math.abs(change).toFixed(1))}
    </Badge>
  );
}

function StatCard({ title, value, change, helper, icon: Icon }: StatCardProps) {
  return (
    <Card size="sm" className="h-full min-w-0">
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <CardTitle className="truncate text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="truncate font-mono text-2xl font-semibold tabular-nums">
          {value}
        </p>
        <ChangeBadge change={change} />
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

interface FocusItemProps {
  title: string;
  description: string;
  icon: ReactNode;
  tone?: ActionTone;
  href?: string;
  ctaLabel?: string;
}

function FocusItem({
  title,
  description,
  icon,
  tone = "primary",
  href,
  ctaLabel,
}: FocusItemProps) {
  return (
    <Item variant="outline" className="items-start">
      <ItemMedia
        variant="icon"
        className={cn(
          "size-8 rounded-md",
          ACTION_TONE_CLASSNAME[tone],
          "[&_svg]:size-4",
        )}
      >
        {icon}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full text-sm">{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      {href && ctaLabel ? (
        <ItemActions className="w-full justify-start sm:w-auto sm:justify-end">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <Link href={href}>{ctaLabel}</Link>
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}

function TodayPulse({
  revenue,
  orders,
  avgOrderValue,
}: {
  revenue: number;
  orders: number;
  avgOrderValue: number;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{ADMIN_DASHBOARD_COPY.todayPulseTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {ADMIN_DASHBOARD_COPY.collectedRevenueLabel}
          </p>
          <p className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums text-primary">
            {formatVND(revenue)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              {ADMIN_DASHBOARD_COPY.todayOrdersLabel}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {orders.toLocaleString("vi-VN")}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              {ADMIN_DASHBOARD_COPY.avgOrderLabel}
            </p>
            <p className="mt-1 truncate font-mono text-lg font-semibold tabular-nums">
              {formatVND(Math.round(avgOrderValue))}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentOrderList({ orders }: { orders: RecentOrders }) {
  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{ADMIN_DASHBOARD_COPY.noRecentOrderTitle}</EmptyTitle>
          <EmptyDescription>
            {ADMIN_DASHBOARD_COPY.noRecentOrderDescription}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {orders.map((order) => (
        <li
          key={order.id}
          className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              #{order.order_number}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.branch_name} · {formatTime(order.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
            <span className="font-mono text-sm font-medium tabular-nums">
              {formatVND(order.total_amount)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DashboardFocus({
  revenueChange,
  ordersChange,
  recentOrder,
  reportsHref,
  ordersHref,
  hrHref,
}: {
  revenueChange: number;
  ordersChange: number;
  recentOrder: RecentOrder | null;
  reportsHref?: string;
  ordersHref?: string;
  hrHref?: string;
}) {
  const revenueIsPositive = revenueChange >= 0;
  const orderIsPositive = ordersChange >= 0;
  const revenueFocusTitle = revenueIsPositive
    ? ADMIN_DASHBOARD_COPY.revenueFocusPositive
    : ADMIN_DASHBOARD_COPY.revenueFocusWarning;
  const revenueFocusDescription = ADMIN_DASHBOARD_COPY.revenueFocusDescription(
    Math.abs(revenueChange).toFixed(1),
  );
  const recentOrderTitle = recentOrder
    ? ADMIN_DASHBOARD_COPY.latestOrderTitle(recentOrder.order_number)
    : ADMIN_DASHBOARD_COPY.noRecentOrderFocusTitle;
  const recentOrderDescription = recentOrder
    ? ADMIN_DASHBOARD_COPY.latestOrderDescription(
        recentOrder.branch_name,
        formatTime(recentOrder.created_at),
        formatVND(recentOrder.total_amount),
      )
    : ADMIN_DASHBOARD_COPY.ordersFocusDescription(
        Math.abs(ordersChange).toFixed(1),
      );

  return (
    <Card className="min-w-0 lg:col-span-2">
      <CardHeader>
        <CardTitle>{ADMIN_DASHBOARD_COPY.focusTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          <FocusItem
            title={revenueFocusTitle}
            description={revenueFocusDescription}
            icon={<IconTrendingUp />}
            tone={revenueIsPositive ? "success" : "warning"}
            href={reportsHref}
            ctaLabel={reportsHref ? ADMIN_DASHBOARD_COPY.reportsCta : undefined}
          />
          <FocusItem
            title={recentOrderTitle}
            description={recentOrderDescription}
            icon={<IconReceipt />}
            tone={orderIsPositive ? "info" : "warning"}
            href={ordersHref}
            ctaLabel={ordersHref ? ADMIN_DASHBOARD_COPY.ordersCta : undefined}
          />
          {hrHref ? (
            <FocusItem
              title={APP_COPY_VI.hrWorkspace}
              description={APP_COPY_VI.hrWorkspaceSubtitle}
              icon={<IconBriefcase />}
              tone="secondary"
              href={hrHref}
              ctaLabel={ADMIN_DASHBOARD_COPY.hrCta}
            />
          ) : null}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

function buildShortcutCards(
  role: Parameters<typeof canAccess>[0],
): SurfaceLinkCardProps[] {
  const cards: SurfaceLinkCardProps[] = [];

  if (canAccess(role, "reports")) {
    cards.push({
      title: MODULE_ACL.reports.label,
      href: MODULE_ACL.reports.path,
      description: "Doanh thu, tồn kho, tài chính và ngày công.",
      icon: <IconBarChart />,
      tone: "primary",
      ctaLabel: ADMIN_DASHBOARD_COPY.reportsCta,
    });
  }

  if (canAccess(role, "hr")) {
    cards.push({
      title: MODULE_ACL.hr.label,
      href: MODULE_ACL.hr.path,
      description: APP_COPY_VI.hrWorkspaceSubtitle,
      icon: <IconBriefcase />,
      tone: "info",
      ctaLabel: ADMIN_DASHBOARD_COPY.hrCta,
    });
  }

  if (canAccess(role, "staff")) {
    cards.push({
      title: MODULE_ACL.staff.label,
      href: MODULE_ACL.staff.path,
      description: "Tài khoản, vai trò và phân quyền.",
      icon: <IconUsers />,
      tone: "secondary",
      ctaLabel: ADMIN_DASHBOARD_COPY.staffCta,
    });
  }

  if (canAccess(role, "inventory")) {
    cards.push({
      title: MODULE_ACL.inventory.label,
      href: MODULE_ACL.inventory.path,
      description: "Tồn kho, nhập hàng và kiểm kê.",
      icon: <IconPackage />,
      tone: "info",
      ctaLabel: ADMIN_DASHBOARD_COPY.inventoryCta,
    });
  }

  if (canAccess(role, "finance")) {
    cards.push({
      title: MODULE_ACL.finance.label,
      href: MODULE_ACL.finance.path,
      description: "Dòng tiền, đối soát và kỳ kế toán.",
      icon: <IconWallet />,
      tone: "success",
      ctaLabel: ADMIN_DASHBOARD_COPY.financeCta,
    });
  }

  if (canAccess(role, "feedback")) {
    cards.push({
      title: MODULE_ACL.feedback.label,
      href: MODULE_ACL.feedback.path,
      description: "Ý kiến khách, QR và kênh nhận thông báo.",
      icon: <IconMessageSquare />,
      tone: "warning",
      ctaLabel: ADMIN_DASHBOARD_COPY.feedbackCta,
    });
  }

  if (canAccess(role, "settings")) {
    cards.push({
      title: MODULE_ACL.settings.label,
      href: MODULE_ACL.settings.path,
      description: "Chi nhánh, bàn, POS, bếp và máy in.",
      icon: <IconSettings />,
      tone: "secondary",
      ctaLabel: ADMIN_DASHBOARD_COPY.settingsCta,
    });
  }

  return cards;
}

function RecentOrderSection({ orders }: { orders: RecentOrders }) {
  return (
    <AppSection
      title={ADMIN_DASHBOARD_COPY.recentOrdersTitle}
      description={ADMIN_DASHBOARD_COPY.recentOrdersDescription}
      contentClassName="gap-0"
    >
      <RecentOrderList orders={orders} />
    </AppSection>
  );
}

function StatGrid({
  todayRevenue,
  todayOrders,
  avgOrderValue,
  revenueChange,
  ordersChange,
  avgChange,
}: {
  todayRevenue: number;
  todayOrders: number;
  avgOrderValue: number;
  revenueChange: number;
  ordersChange: number;
  avgChange: number;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-heading text-base font-semibold tracking-tight">
          {ADMIN_DASHBOARD_COPY.statsTitle}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {ADMIN_DASHBOARD_COPY.statsDescription}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title={ADMIN_DASHBOARD_COPY.revenueLabel}
          value={formatVND(todayRevenue)}
          change={revenueChange}
          helper={ADMIN_DASHBOARD_COPY.revenueHelper}
          icon={IconCurrencyDollar}
        />
        <StatCard
          title={ADMIN_DASHBOARD_COPY.todayOrdersLabel}
          value={todayOrders.toLocaleString("vi-VN")}
          change={ordersChange}
          helper={ADMIN_DASHBOARD_COPY.ordersHelper}
          icon={IconReceipt}
        />
        <StatCard
          title={ADMIN_DASHBOARD_COPY.avgOrderLabel}
          value={formatVND(Math.round(avgOrderValue))}
          change={avgChange}
          helper={ADMIN_DASHBOARD_COPY.avgOrderHelper}
          icon={IconTrendingUp}
        />
      </div>
    </section>
  );
}

const ADMIN_DASHBOARD_COPY = {
  pageTitle: "Tổng quan vận hành",
  pageDescription:
    "Theo dõi doanh thu, đơn bán và các lối vào xử lý trong ngày.",
  pageBadge: "Hôm nay",
  focusTitle: "Cần xem hôm nay",
  revenueFocusPositive: "Doanh thu đang tốt hơn hôm qua",
  revenueFocusWarning: "Doanh thu thấp hơn hôm qua",
  revenueFocusDescription: (change: string) =>
    `${change}% so với hôm qua. Mở báo cáo để xem chi tiết theo chi nhánh.`,
  latestOrderTitle: (orderNumber: string) => `Đơn mới nhất #${orderNumber}`,
  latestOrderDescription: (branch: string, time: string, total: string) =>
    `${branch} · ${time} · ${total}`,
  noRecentOrderFocusTitle: "Chưa có đơn mới trong danh sách gần đây",
  ordersFocusDescription: (change: string) =>
    `${change}% đơn bán so với hôm qua.`,
  todayPulseTitle: "Nhịp hôm nay",
  collectedRevenueLabel: "Doanh thu đã thu",
  statsTitle: "Chỉ số hôm nay",
  statsDescription:
    "So sánh nhanh với hôm qua để biết ca bán đang đi theo hướng nào.",
  revenueLabel: "Doanh thu",
  todayOrdersLabel: "Đơn bán",
  avgOrderLabel: "Trung bình/đơn",
  revenueHelper: "Tổng tiền đã thu trong ngày.",
  ordersHelper: "Số đơn đã thanh toán.",
  avgOrderHelper: "Giá trị trung bình mỗi đơn.",
  shortcutTitle: "Mở nhanh quản trị",
  shortcutDescription: "Các khu vực quản lý cần vào thường xuyên trong ngày.",
  recentOrdersTitle: "Đơn hàng gần đây",
  recentOrdersDescription: "Các đơn mới nhất trong phạm vi quản trị hiện tại.",
  noRecentOrderTitle: "Chưa có đơn hàng mới",
  noRecentOrderDescription: "Đơn hàng bán trong ngày sẽ xuất hiện tại đây.",
  changeFromYesterday: (change: string) => `${change}% so với hôm qua`,
  reportsCta: "Mở báo cáo",
  ordersCta: "Mở đơn hàng",
  staffCta: "Mở nhân viên",
  inventoryCta: "Mở kho",
  financeCta: "Mở kế toán",
  feedbackCta: "Mở phản ánh",
  settingsCta: "Mở cài đặt",
  hrCta: "Mở nhân sự",
} as const;

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
  const [{ claims }, stats] = await Promise.all([
    loadAuthState(),
    fetchDashboardStats(),
  ]);
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
  const shortcutCards = buildShortcutCards(claims.user_role);
  const recentOrder = stats.recentOrders[0] ?? null;
  const reportsHref = canAccess(claims.user_role, "reports")
    ? "/admin/reports/revenue"
    : undefined;
  const ordersHref = canAccess(claims.user_role, "orders")
    ? MODULE_ACL.orders.path
    : undefined;
  const hrHref = canAccess(claims.user_role, "hr")
    ? MODULE_ACL.hr.path
    : undefined;

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={ADMIN_DASHBOARD_COPY.pageTitle}
        description={ADMIN_DASHBOARD_COPY.pageDescription}
        badge={{
          children: ADMIN_DASHBOARD_COPY.pageBadge,
          variant: "secondary",
        }}
      />

      <section className="grid gap-3 lg:grid-cols-3">
        <DashboardFocus
          revenueChange={revenueChange}
          ordersChange={ordersChange}
          recentOrder={recentOrder}
          reportsHref={reportsHref}
          ordersHref={ordersHref}
          hrHref={hrHref}
        />
        <TodayPulse
          revenue={stats.todayRevenue}
          orders={stats.todayOrders}
          avgOrderValue={stats.avgOrderValue}
        />
      </section>

      <StatGrid
        todayRevenue={stats.todayRevenue}
        todayOrders={stats.todayOrders}
        avgOrderValue={stats.avgOrderValue}
        revenueChange={revenueChange}
        ordersChange={ordersChange}
        avgChange={avgChange}
      />

      {shortcutCards.length > 0 ? (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              {ADMIN_DASHBOARD_COPY.shortcutTitle}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {ADMIN_DASHBOARD_COPY.shortcutDescription}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shortcutCards.map((card) => (
              <SurfaceLinkCard key={card.href} {...card} />
            ))}
          </div>
        </section>
      ) : null}

      <RecentOrderSection orders={stats.recentOrders} />
    </AppPage>
  );
}
