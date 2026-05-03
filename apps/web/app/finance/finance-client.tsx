"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Book as IconBook,
  CalendarDays as IconCalendar,
  ChartBar as IconChartBar,
  FileText as IconFileText,
  Receipt as IconReceipt,
  ScrollText as IconScrollText,
  Settings2 as IconSettings,
  TriangleAlert as IconAlertTriangle,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { formatVND } from "@comtammatu/shared/format";
import type { FinanceLayoutMode } from "./page";
import type { DailyRevenueRow, InvoiceRow, TopItemRow } from "./page";
import type { AccessibleBranch, KpiBundle } from "./revenue/page";
import { InvoiceList } from "./invoice-list";
import { RevenueOverview } from "./revenue-overview";
import { useFinanceRealtimeRefresh } from "./use-finance-realtime-refresh";

interface FinanceClientProps {
  layout: FinanceLayoutMode;
  branches: AccessibleBranch[];
  branchId: number | null;
  today: string;
  periodStart: string;
  todayKpis: KpiBundle | null;
  yesterdayKpis: KpiBundle | null;
  monthKpis: KpiBundle | null;
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
  invoices: InvoiceRow[];
}

export function FinanceClient({
  layout,
  branches,
  branchId,
  today,
  periodStart,
  todayKpis,
  yesterdayKpis,
  monthKpis,
  dailyRevenue,
  topItems,
  invoices,
}: FinanceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  useFinanceRealtimeRefresh({ branchId });

  const branchLabel = useMemo(() => {
    if (branchId == null) return "Tất cả chi nhánh";
    return (
      branches.find((b) => b.id === branchId)?.name ?? `Chi nhánh ${branchId}`
    );
  }, [branchId, branches]);

  function replaceParams(next: {
    layout?: FinanceLayoutMode;
    branch?: string;
  }) {
    const usp = new URLSearchParams(searchParams);
    if (next.layout) usp.set("layout", next.layout);
    if (next.branch) usp.set("branch", next.branch);
    startTransition(() => {
      router.replace(`/finance?${usp.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-2 sm:max-w-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Chi nhánh
            </span>
            <Select
              value={branchId == null ? "all" : String(branchId)}
              onValueChange={(value) => replaceParams({ branch: value })}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chi nhánh</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LayoutPicker
            value={layout}
            onChange={(next) => replaceParams({ layout: next })}
          />
        </CardContent>
      </Card>

      {layout === "simple" ? (
        <SimpleFinanceOverview
          branchLabel={branchLabel}
          today={today}
          periodStart={periodStart}
          todayKpis={todayKpis}
          yesterdayKpis={yesterdayKpis}
          monthKpis={monthKpis}
          dailyRevenue={dailyRevenue}
          topItems={topItems}
          invoiceCount={invoices.length}
        />
      ) : (
        <AdvancedFinanceWorkspace
          dailyRevenue={dailyRevenue}
          topItems={topItems}
          invoices={invoices}
        />
      )}
    </div>
  );
}

function LayoutPicker({
  value,
  onChange,
}: {
  value: FinanceLayoutMode;
  onChange: (value: FinanceLayoutMode) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as FinanceLayoutMode)}
    >
      <TabsList className="w-full md:w-auto">
        <TabsTrigger value="simple" className="flex-1 md:flex-none">
          Đơn giản
        </TabsTrigger>
        <TabsTrigger value="advanced" className="flex-1 md:flex-none">
          Chuyên sâu
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function SimpleFinanceOverview({
  branchLabel,
  today,
  periodStart,
  todayKpis,
  yesterdayKpis,
  monthKpis,
  dailyRevenue,
  topItems,
  invoiceCount,
}: {
  branchLabel: string;
  today: string;
  periodStart: string;
  todayKpis: KpiBundle | null;
  yesterdayKpis: KpiBundle | null;
  monthKpis: KpiBundle | null;
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
  invoiceCount: number;
}) {
  const todayRevenue = todayKpis?.net_revenue ?? 0;
  const yesterdayRevenue = yesterdayKpis?.net_revenue ?? 0;
  const orderCount = todayKpis?.order_count ?? 0;
  const averageOrder = orderCount > 0 ? todayRevenue / orderCount : 0;
  const daily = dailyRevenue.slice(-7).reverse();
  const paymentTotal =
    (todayKpis?.cash_revenue ?? 0) +
    (todayKpis?.vietqr_revenue ?? 0) +
    (todayKpis?.momo_revenue ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-2">
            <Badge variant="secondary">Live · {branchLabel}</Badge>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{today}</p>
              <p className="text-3xl font-bold tabular-nums text-primary">
                {formatVND(todayRevenue)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDelta(todayRevenue, yesterdayRevenue)} so với hôm qua.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Số đơn hôm nay"
              value={orderCount.toLocaleString("vi-VN")}
            />
            <Metric
              label="Trung bình / đơn"
              value={averageOrder > 0 ? formatVND(averageOrder) : "—"}
            />
            <Metric
              label="HĐĐT"
              value={invoiceCount.toLocaleString("vi-VN")}
              hint="Tổng hóa đơn đang lưu"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">7 ngày gần nhất</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có doanh thu trong khoảng này.
              </p>
            ) : (
              daily.map((row) => (
                <div
                  key={row.date}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <div>
                    <p className="font-medium tabular-nums">{row.date}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.order_count.toLocaleString("vi-VN")} đơn
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums">
                    {formatVND(row.total_revenue ?? 0)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thanh toán hôm nay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PaymentLine
              label="Tiền mặt"
              value={todayKpis?.cash_revenue ?? 0}
              total={paymentTotal}
            />
            <PaymentLine
              label="VietQR"
              value={todayKpis?.vietqr_revenue ?? 0}
              total={paymentTotal}
            />
            <PaymentLine
              label="MoMo"
              value={todayKpis?.momo_revenue ?? 0}
              total={paymentTotal}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top món trong tháng</CardTitle>
            <p className="text-sm text-muted-foreground">
              Từ {periodStart} đến {today}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {topItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có dữ liệu món.
              </p>
            ) : (
              topItems.slice(0, 5).map((item) => (
                <div
                  key={`${item.branch_id}-${item.menu_item_id}`}
                  className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <div>
                    <p className="font-medium">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(item.quantity_sold).toLocaleString("vi-VN")} phần
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums">
                    {formatVND(item.revenue)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tháng hiện tại</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="Doanh thu tháng"
              value={formatVND(monthKpis?.net_revenue ?? 0)}
            />
            <Metric
              label="Giảm giá"
              value={formatVND(monthKpis?.discount_amount ?? 0)}
            />
            <Metric
              label="VAT đầu ra"
              value={formatVND(monthKpis?.total_tax ?? 0)}
            />
            <Metric
              label="Hoàn / hủy"
              value={formatVND(monthKpis?.voided_amount ?? 0)}
              hint={`${monthKpis?.voided_count ?? 0} đơn`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURE_LINKS.map((feature) => (
          <Button
            asChild
            key={feature.href}
            variant="outline"
            className="h-auto justify-start gap-3 p-4"
          >
            <Link href={feature.href}>
              <feature.icon className="size-4" />
              <span className="text-left">{feature.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

function AdvancedFinanceWorkspace({
  dailyRevenue,
  topItems,
  invoices,
}: {
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
  invoices: InvoiceRow[];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tính năng chuyên sâu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_LINKS.map((feature) => (
            <Button
              asChild
              key={feature.href}
              variant="outline"
              className="h-auto justify-start gap-3 p-4"
            >
              <Link href={feature.href}>
                <feature.icon className="size-4" />
                <span className="text-left">{feature.label}</span>
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto p-2">
          <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
          <TabsTrigger value="invoices">
            Hóa đơn điện tử ({invoices.length})
          </TabsTrigger>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/finance/reconciliation">
              <IconAlertTriangle className="mr-1 size-4 text-warning" />
              Đối soát
            </Link>
          </Button>
        </TabsList>

        <TabsContent value="revenue" className="mt-0">
          <RevenueOverview dailyRevenue={dailyRevenue} topItems={topItems} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          <InvoiceList initialInvoices={invoices} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function PaymentLine({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums">
        {formatVND(value)}
        <span className="ml-2 text-xs text-muted-foreground">
          {total > 0 ? `${Math.round((value / total) * 100)}%` : "0%"}
        </span>
      </span>
    </div>
  );
}

function formatDelta(current: number, previous: number): string {
  if (previous === 0 && current === 0) return "0%";
  if (previous === 0) return "mới phát sinh";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const FEATURE_LINKS = [
  {
    href: "/finance/revenue",
    label: "Báo cáo doanh thu",
    icon: IconTrendingUp,
  },
  {
    href: "/finance/reconciliation",
    label: "Đối chiếu sổ",
    icon: IconAlertTriangle,
  },
  {
    href: "/finance/chart-of-accounts",
    label: "Hệ thống tài khoản",
    icon: IconBook,
  },
  { href: "/finance/journal", label: "Sổ nhật ký", icon: IconFileText },
  {
    href: "/finance/posting-rules",
    label: "Quy tắc hạch toán",
    icon: IconSettings,
  },
  {
    href: "/finance/statements",
    label: "Báo cáo tài chính",
    icon: IconChartBar,
  },
  { href: "/finance/food-cost", label: "Giá vốn món", icon: IconReceipt },
  { href: "/finance/periods", label: "Kỳ kế toán", icon: IconCalendar },
  {
    href: "/finance/audit-trail",
    label: "Nhật ký kiểm toán",
    icon: IconScrollText,
  },
  { href: "/finance", label: "Tổng quan module", icon: IconWallet },
] as const;
