import Link from "next/link";
import {
  BarChart3 as IconBarChart,
  Briefcase as IconBriefcase,
  ClipboardList as IconClipboardList,
  DollarSign as IconCurrencyDollar,
  Package as IconPackage,
  Printer as IconPrinter,
  Receipt as IconReceipt,
  Settings as IconSettings,
  Store as IconStore,
  TrendingUp as IconTrendingUp,
  Users as IconUsers,
  Utensils as IconUtensils,
  Wallet as IconWallet,
} from "lucide-react";
import { canAccess, MODULE_ACL } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { StatusBadge } from "@/components/status-badge";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { buildCompareDelta } from "@/components/kpi/compare-chip";
import {
  SurfaceLinkCard,
  type SurfaceLinkCardProps,
} from "@/components/surface-link-card";
import {
  fetchAdminOverview,
  fetchBranchOperatingStatus,
  fetchDashboardStats,
  type BranchOperatingRow,
} from "./actions";

type RecentOrders = Awaited<
  ReturnType<typeof fetchDashboardStats>
>["recentOrders"];

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
              {order.branch_name} · {formatVNTime(order.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge domain="order" value={order.status} />
            <span className="font-mono text-sm font-medium tabular-nums">
              {formatVND(order.total_amount)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BranchOperatingItem({ row }: { row: BranchOperatingRow }) {
  const posOpen = row.posOpenedAt !== null;

  return (
    <Item variant="outline" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle className="flex w-full flex-wrap items-center gap-2 text-sm">
          {row.branchName}
          <Badge variant={posOpen ? "success" : "warning"}>
            {posOpen && row.posOpenedAt
              ? ADMIN_DASHBOARD_COPY.branchPosOpenBadge(
                  formatVNTime(row.posOpenedAt),
                )
              : ADMIN_DASHBOARD_COPY.branchPosClosedBadge}
          </Badge>
          <Badge
            variant={
              row.printerOnline
                ? "success"
                : row.printerHasAgent
                  ? "destructive"
                  : "secondary"
            }
          >
            {row.printerOnline
              ? ADMIN_DASHBOARD_COPY.branchPrinterOnlineBadge
              : row.printerHasAgent
                ? ADMIN_DASHBOARD_COPY.branchPrinterOfflineBadge
                : ADMIN_DASHBOARD_COPY.branchPrinterNoAgentBadge}
          </Badge>
          {row.printerFailed24h > 0 ? (
            <Badge variant="destructive">
              {ADMIN_DASHBOARD_COPY.branchPrinterFailedBadge(
                row.printerFailed24h,
              )}
            </Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription>
          {ADMIN_DASHBOARD_COPY.branchSales(
            row.paidOrders.toLocaleString("vi-VN"),
            formatVND(row.todayRevenue),
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="w-full justify-start sm:w-auto sm:justify-end">
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link href={`/br/${String(row.branchId)}/dashboard`}>
            {ADMIN_DASHBOARD_COPY.branchOpenCta}
          </Link>
        </Button>
      </ItemActions>
    </Item>
  );
}

function buildSetupCards(
  role: Parameters<typeof canAccess>[0],
): SurfaceLinkCardProps[] {
  const cards: SurfaceLinkCardProps[] = [];

  if (canAccess(role, "settings")) {
    cards.push({
      title: ADMIN_DASHBOARD_COPY.setupBranchesTitle,
      href: "/admin/settings/branches",
      description: ADMIN_DASHBOARD_COPY.setupBranchesDescription,
      icon: <IconStore />,
      tone: "primary",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  if (canAccess(role, "staff")) {
    cards.push({
      title: ADMIN_DASHBOARD_COPY.setupStaffTitle,
      href: MODULE_ACL.staff.path,
      description: ADMIN_DASHBOARD_COPY.setupStaffDescription,
      icon: <IconUsers />,
      tone: "secondary",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  if (canAccess(role, "menu")) {
    cards.push({
      title: MODULE_ACL.menu.label,
      href: MODULE_ACL.menu.path,
      description: ADMIN_DASHBOARD_COPY.setupMenuDescription,
      icon: <IconUtensils />,
      tone: "info",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  if (canAccess(role, "settings")) {
    cards.push({
      title: ADMIN_DASHBOARD_COPY.setupPrintersTitle,
      href: "/admin/settings/printers",
      description: ADMIN_DASHBOARD_COPY.setupPrintersDescription,
      icon: <IconPrinter />,
      tone: "secondary",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
    cards.push({
      title: MODULE_ACL.settings.label,
      href: MODULE_ACL.settings.path,
      description: ADMIN_DASHBOARD_COPY.setupSettingsDescription,
      icon: <IconSettings />,
      tone: "secondary",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  return cards;
}

function buildDomainCards(
  role: Parameters<typeof canAccess>[0],
): SurfaceLinkCardProps[] {
  const cards: SurfaceLinkCardProps[] = [];

  if (canAccess(role, "orders")) {
    cards.push({
      title: MODULE_ACL.orders.label,
      href: MODULE_ACL.orders.path,
      description: ADMIN_DASHBOARD_COPY.domainOrdersDescription,
      icon: <IconClipboardList />,
      tone: "primary",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  if (canAccess(role, "inventory")) {
    cards.push({
      title: MODULE_ACL.inventory.label,
      href: MODULE_ACL.inventory.path,
      description: ADMIN_DASHBOARD_COPY.domainInventoryDescription,
      icon: <IconPackage />,
      tone: "info",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  if (canAccess(role, "finance")) {
    cards.push({
      title: MODULE_ACL.finance.label,
      href: MODULE_ACL.finance.path,
      description: ADMIN_DASHBOARD_COPY.domainFinanceDescription,
      icon: <IconWallet />,
      tone: "success",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  if (canAccess(role, "hr")) {
    cards.push({
      title: MODULE_ACL.hr.label,
      href: MODULE_ACL.hr.path,
      description: APP_COPY_VI.hrWorkspaceSubtitle,
      icon: <IconBriefcase />,
      tone: "info",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  if (canAccess(role, "reports")) {
    cards.push({
      title: MODULE_ACL.reports.label,
      href: MODULE_ACL.reports.path,
      description: ADMIN_DASHBOARD_COPY.domainReportsDescription,
      icon: <IconBarChart />,
      tone: "secondary",
      ctaLabel: ADMIN_DASHBOARD_COPY.openCta,
    });
  }

  return cards;
}

const ADMIN_DASHBOARD_COPY = {
  pageTitle: "Điều hành hệ thống",
  pageDescription:
    "Sự thật vận hành hôm nay của toàn chuỗi: doanh thu, chi nhánh, thiết lập và lối vào nghiệp vụ.",
  pageBadge: "Hôm nay",
  overviewTitle: "Tổng quan hệ thống",
  overviewDescription:
    "Doanh thu, chi phí, lợi nhuận hôm nay và giá trị tồn kho hiện tại.",
  revenueLabel: "Doanh thu",
  todayOrdersLabel: "Đơn bán",
  avgOrderLabel: "Trung bình/đơn",
  revenueHelper: "Tổng tiền đã thu trong ngày.",
  ordersHelper: "Số đơn đã thanh toán.",
  avgOrderHelper: "Giá trị trung bình mỗi đơn.",
  grossProfitLabel: "Lợi nhuận gộp",
  grossProfitHelper: "Doanh thu trước VAT trừ chi phí nguyên liệu hôm nay.",
  costLabel: "Chi phí",
  costHelper: "Nguyên liệu và chi vận hành hôm nay.",
  inventoryValueLabel: "Giá trị tồn kho",
  inventoryValueHelper: "Giá trị tồn kho hiện tại trong phạm vi quản trị.",
  compareHint: "vs hôm qua",
  branchStatusTitle: "Vận hành theo chi nhánh",
  branchStatusDescription:
    "Đơn, doanh thu, ca POS và máy in của từng chi nhánh hôm nay.",
  branchSales: (orders: string, revenue: string) =>
    `${orders} đơn đã thanh toán · ${revenue}`,
  branchPosOpenBadge: (time: string) => `POS mở từ ${time}`,
  branchPosClosedBadge: "POS chưa mở",
  branchPrinterOnlineBadge: "In online",
  branchPrinterOfflineBadge: "In offline",
  branchPrinterNoAgentBadge: "Chưa có agent in",
  branchPrinterFailedBadge: (count: number) => `${String(count)} lỗi in 24h`,
  branchOpenCta: "Mở chi nhánh",
  branchStatusEmptyTitle: "Chưa có chi nhánh hoạt động",
  branchStatusEmptyDescription:
    "Khai báo chi nhánh trong Thiết lập hệ thống để bắt đầu vận hành.",
  setupTitle: "Thiết lập hệ thống",
  setupDescription:
    "Khởi tạo và điều chỉnh nền tảng vận hành của chuỗi theo từng bước.",
  setupBranchesTitle: "Chi nhánh & bàn",
  setupBranchesDescription: "Khai báo chi nhánh, khu vực và bàn phục vụ.",
  setupStaffTitle: "Nhân sự & quyền",
  setupStaffDescription: "Tài khoản, vai trò và phân quyền truy cập.",
  setupMenuDescription: "Món, giá bán, biến thể và món thêm.",
  setupPrintersTitle: "Máy in & mẫu phiếu",
  setupPrintersDescription: "Máy in chi nhánh, định tuyến và mẫu phiếu in.",
  setupSettingsDescription: "POS, bếp, thanh toán và các thiết lập chung.",
  domainTitle: "Không gian nghiệp vụ",
  domainDescription: "Đi thẳng vào không gian xử lý công việc theo mảng.",
  domainOrdersDescription: "Tra cứu đơn, hoàn tiền và xử lý sự cố bán hàng.",
  domainInventoryDescription: "Tồn kho, nhập hàng và kiểm kê.",
  domainFinanceDescription: "Doanh thu, chi vận hành, lãi gộp và HĐĐT.",
  domainReportsDescription: "Báo cáo doanh thu và vận hành theo chi nhánh.",
  recentOrdersTitle: "Đơn hàng gần đây",
  recentOrdersDescription: "Các đơn mới nhất trong phạm vi quản trị hiện tại.",
  noRecentOrderTitle: "Chưa có đơn hàng mới",
  noRecentOrderDescription: "Đơn hàng bán trong ngày sẽ xuất hiện tại đây.",
  openCta: "Mở",
} as const;

export default async function DashboardPage() {
  const [{ claims }, stats, overview, branchStatus] = await Promise.all([
    loadAuthState(),
    fetchDashboardStats(),
    fetchAdminOverview(),
    fetchBranchOperatingStatus(),
  ]);

  const yesterdayAvg =
    stats.yesterdayOrders > 0
      ? stats.yesterdayRevenue / stats.yesterdayOrders
      : 0;
  const role = claims.user_role;
  const setupCards = buildSetupCards(role);
  const domainCards = buildDomainCards(role);
  const reportsHref = canAccess(role, "reports")
    ? "/admin/reports/revenue"
    : undefined;
  const ordersHref = canAccess(role, "orders")
    ? MODULE_ACL.orders.path
    : undefined;
  const financeHref = canAccess(role, "finance")
    ? MODULE_ACL.finance.path
    : undefined;
  const foodCostHref = canAccess(role, "finance")
    ? "/finance/food-cost"
    : undefined;
  const inventoryHref = canAccess(role, "inventory")
    ? MODULE_ACL.inventory.path
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

      <AppSection
        title={ADMIN_DASHBOARD_COPY.overviewTitle}
        description={ADMIN_DASHBOARD_COPY.overviewDescription}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard
            label={ADMIN_DASHBOARD_COPY.revenueLabel}
            value={formatVND(stats.todayRevenue)}
            delta={buildCompareDelta(
              stats.todayRevenue,
              stats.yesterdayRevenue,
              "higher_better",
            )}
            compareHint={ADMIN_DASHBOARD_COPY.compareHint}
            hint={ADMIN_DASHBOARD_COPY.revenueHelper}
            icon={<IconCurrencyDollar />}
            href={reportsHref}
            className="col-span-2 sm:col-span-1"
          />
          <KpiCard
            label={ADMIN_DASHBOARD_COPY.todayOrdersLabel}
            value={stats.todayOrders.toLocaleString("vi-VN")}
            delta={buildCompareDelta(
              stats.todayOrders,
              stats.yesterdayOrders,
              "higher_better",
            )}
            compareHint={ADMIN_DASHBOARD_COPY.compareHint}
            hint={ADMIN_DASHBOARD_COPY.ordersHelper}
            icon={<IconReceipt />}
            href={ordersHref}
          />
          <KpiCard
            label={ADMIN_DASHBOARD_COPY.avgOrderLabel}
            value={formatVND(Math.round(stats.avgOrderValue))}
            delta={buildCompareDelta(
              stats.avgOrderValue,
              yesterdayAvg,
              "higher_better",
            )}
            compareHint={ADMIN_DASHBOARD_COPY.compareHint}
            hint={ADMIN_DASHBOARD_COPY.avgOrderHelper}
            icon={<IconTrendingUp />}
          />
          {overview.finance ? (
            <>
              <KpiCard
                label={ADMIN_DASHBOARD_COPY.grossProfitLabel}
                value={formatVND(Math.round(overview.finance.grossProfit))}
                hint={ADMIN_DASHBOARD_COPY.grossProfitHelper}
                icon={<IconTrendingUp />}
                href={financeHref}
              />
              <KpiCard
                label={ADMIN_DASHBOARD_COPY.costLabel}
                value={formatVND(
                  Math.round(
                    overview.finance.ingredientCost +
                      overview.finance.operatingExpense,
                  ),
                )}
                hint={ADMIN_DASHBOARD_COPY.costHelper}
                icon={<IconWallet />}
                href={foodCostHref}
              />
            </>
          ) : null}
          {overview.inventoryValue !== null ? (
            <KpiCard
              label={ADMIN_DASHBOARD_COPY.inventoryValueLabel}
              value={formatVND(Math.round(overview.inventoryValue))}
              hint={ADMIN_DASHBOARD_COPY.inventoryValueHelper}
              icon={<IconPackage />}
              href={inventoryHref}
            />
          ) : null}
        </div>
      </AppSection>

      <AppSection
        title={ADMIN_DASHBOARD_COPY.branchStatusTitle}
        description={ADMIN_DASHBOARD_COPY.branchStatusDescription}
      >
        {branchStatus.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {ADMIN_DASHBOARD_COPY.branchStatusEmptyTitle}
              </EmptyTitle>
              <EmptyDescription>
                {ADMIN_DASHBOARD_COPY.branchStatusEmptyDescription}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-2">
            {branchStatus.map((row) => (
              <BranchOperatingItem key={row.branchId} row={row} />
            ))}
          </ItemGroup>
        )}
      </AppSection>

      {setupCards.length > 0 ? (
        <AppSection
          title={ADMIN_DASHBOARD_COPY.setupTitle}
          description={ADMIN_DASHBOARD_COPY.setupDescription}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {setupCards.map((card) => (
              <SurfaceLinkCard key={card.href} {...card} />
            ))}
          </div>
        </AppSection>
      ) : null}

      {domainCards.length > 0 ? (
        <AppSection
          title={ADMIN_DASHBOARD_COPY.domainTitle}
          description={ADMIN_DASHBOARD_COPY.domainDescription}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {domainCards.map((card) => (
              <SurfaceLinkCard key={card.href} {...card} />
            ))}
          </div>
        </AppSection>
      ) : null}

      <AppSection
        title={ADMIN_DASHBOARD_COPY.recentOrdersTitle}
        description={ADMIN_DASHBOARD_COPY.recentOrdersDescription}
        contentClassName="gap-0"
      >
        <RecentOrderList orders={stats.recentOrders} />
      </AppSection>
    </AppPage>
  );
}
