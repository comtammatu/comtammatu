import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches, fetchOrdersForDay } from "../../actions";
import { RevenueDrillTabs } from "./revenue-drill-tabs";
import type { HourSummary, OrderRow } from "./_lib/revenue-drill-types";

const copy = messages.finance.revenue.drill;

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function summarizeByHour(orders: OrderRow[]): HourSummary[] {
  const map = new Map<number, HourSummary>();
  for (const o of orders) {
    const existing = map.get(o.paid_hour);
    if (existing) {
      existing.order_count += 1;
      existing.total_revenue += Number(o.total_amount);
    } else {
      map.set(o.paid_hour, {
        hour: o.paid_hour,
        order_count: 1,
        total_revenue: Number(o.total_amount),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

function BackToRevenue() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link href="/finance/revenue" className="gap-2">
        <IconArrowLeft className="size-4" />
        {copy.back}
      </Link>
    </Button>
  );
}

export default async function RevenueDrillPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { date } = await params;
  const sp = await searchParams;

  if (!isValidIsoDate(date)) {
    return (
      <AppPage width="wide" density="compact">
        <AppPageHeader
          eyebrow={copy.eyebrow}
          title={copy.invalidDateTitle}
          breadcrumb={<BackToRevenue />}
        />
        <AppEmptyState mode="error" title={copy.invalidDate} />
      </AppPage>
    );
  }

  const branchParam = sp.branch;
  const parsedBranch = branchParam ? Number(branchParam) : NaN;
  const branchId =
    Number.isFinite(parsedBranch) && parsedBranch > 0 ? parsedBranch : null;

  if (branchId == null) {
    const branchesRes = await fetchAccessibleBranches();
    const branches = (branchesRes.success ? (branchesRes.data ?? []) : []) as {
      id: number;
      name: string;
    }[];
    return (
      <AppPage width="wide" density="compact">
        <AppPageHeader
          eyebrow={copy.eyebrow}
          title={copy.selectBranchTitle(date)}
          description={copy.selectBranchDescription}
          breadcrumb={<BackToRevenue />}
        />
        <AppSection title={copy.selectBranchSectionTitle}>
          {branches.length === 0 ? (
            <AppEmptyState compact mode="no-access" title={copy.noBranchAccess} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {branches.map((b) => (
                <li key={b.id}>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link href={`/finance/revenue/${date}?branch=${b.id}`}>
                      {b.name}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </AppSection>
      </AppPage>
    );
  }

  const [branchesRes, ordersRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchOrdersForDay(branchId, date),
  ]);

  const branches = (branchesRes.success ? (branchesRes.data ?? []) : []) as {
    id: number;
    name: string;
  }[];
  const branchName =
    branches.find((b) => b.id === branchId)?.name ??
    messages.finance.common.branchFallback(branchId);
  const orders = (
    ordersRes.success ? (ordersRes.data ?? []) : []
  ) as OrderRow[];

  const hours = summarizeByHour(orders);
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalDiscount = orders.reduce(
    (s, o) => s + Number(o.discount_amount),
    0,
  );
  const totalTax = orders.reduce((s, o) => s + Number(o.tax_amount), 0);

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.detailTitle(branchName, date)}
        description={copy.detailDescription(
          formatCount(totalOrders),
          formatVND(totalRevenue),
        )}
        breadcrumb={<BackToRevenue />}
        badge={{ children: copy.badge, variant: "secondary" }}
      />

      <RevenueDrillTabs
        orders={orders}
        hours={hours}
        totalOrders={totalOrders}
        totalRevenue={totalRevenue}
        totalDiscount={totalDiscount}
        totalTax={totalTax}
      />
    </AppPage>
  );
}
