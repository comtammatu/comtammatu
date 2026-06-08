import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight as IconArrowUpRight,
  ReceiptText as IconReceiptText,
  Wallet as IconWallet,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches, fetchRevenueKpis } from "./actions";
import { FilterBar } from "./components/filter-bar";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "./_lib/finance-params";
import type { FinanceRange } from "./_lib/finance-params";

type SearchParams = Record<string, string | string[] | undefined>;

const financeCopy = messages.finance;
const powerLiteCopy = financeCopy.powerLite;
const HKD_RANGES: readonly FinanceRange[] = ["today", "yesterday", "7d", "mtd"];

type RevenueKpis = {
  net_revenue: number;
  subtotal_revenue: number;
  total_tax: number;
  order_count: number;
  cash_revenue: number;
  vietqr_revenue: number;
  momo_revenue: number;
};

type AccessibleBranch = { id: number; name: string };

function formatCount(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function MetricInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  helper,
  href,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  helper: string;
  href?: string;
}) {
  const content = (
    <Card size="sm" className="h-full min-w-0">
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-muted-foreground">{icon}</span>
            <CardTitle className="truncate">{title}</CardTitle>
          </div>
          {href ? (
            <IconArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p
          className={cn(
            "truncate font-mono text-2xl font-semibold tabular-nums",
          )}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block h-full rounded-lg" aria-label={title}>
      {content}
    </Link>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const params = parseFinanceParams(rawParams);
  const resolved = resolveFinanceRange(params);

  const [branchesRes, kpisRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchRevenueKpis(params.branch, resolved.start, resolved.end),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as AccessibleBranch[];
  const kpis = (kpisRes.success ? kpisRes.data : null) as RevenueKpis | null;

  const netRevenue = Number(kpis?.net_revenue ?? 0);
  const subtotalRevenue = Number(kpis?.subtotal_revenue ?? 0);
  const orderCount = Number(kpis?.order_count ?? 0);
  const cashRevenue = Number(kpis?.cash_revenue ?? 0);
  const vietqrRevenue = Number(kpis?.vietqr_revenue ?? 0);
  const momoRevenue = Number(kpis?.momo_revenue ?? 0);

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={powerLiteCopy.eyebrow}
        title={powerLiteCopy.title}
        description={powerLiteCopy.description}
        meta={financeCopy.basic.periodMeta(resolved.start, resolved.end)}
      />

      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance"
        ranges={HKD_RANGES}
        hide={["granularity", "compare", "payment"]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon={<IconWallet className="size-4 text-muted-foreground" />}
          title={financeCopy.basic.kpis.revenue}
          value={formatVND(netRevenue)}
          helper={financeCopy.basic.kpis.revenueHint(
            formatCount(orderCount),
            formatVND(subtotalRevenue),
          )}
          href="/finance/revenue"
        />
        <SummaryCard
          icon={<IconReceiptText className="size-4 text-muted-foreground" />}
          title={powerLiteCopy.labels.revenueBeforeVat}
          value={formatVND(subtotalRevenue)}
          helper={powerLiteCopy.labels.ordersLine(formatCount(orderCount))}
        />
        <SummaryCard
          icon={<IconReceiptText className="size-4 text-muted-foreground" />}
          title={financeCopy.nav.items.invoices}
          value={formatVND(Number(kpis?.total_tax ?? 0))}
          helper={powerLiteCopy.labels.revenueBeforeVat}
          href="/finance/invoices"
        />
      </div>

      <AppSection
        size="sm"
        title={powerLiteCopy.cashBreakdownTitle}
        icon={<IconWallet className="size-4" />}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <MetricInline
            label={powerLiteCopy.labels.cash}
            value={formatVND(cashRevenue)}
          />
          <MetricInline
            label={powerLiteCopy.labels.vietqr}
            value={formatVND(vietqrRevenue)}
          />
          <MetricInline
            label={powerLiteCopy.labels.momo}
            value={formatVND(momoRevenue)}
          />
          <MetricInline
            label={powerLiteCopy.labels.revenueBeforeVat}
            value={formatVND(subtotalRevenue)}
          />
        </div>
      </AppSection>
    </AppPage>
  );
}
