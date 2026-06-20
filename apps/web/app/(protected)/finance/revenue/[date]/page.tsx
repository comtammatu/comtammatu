import Link from "next/link";
/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing finance revenue detail page keeps operational copy inline */
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { formatVND } from "@comtammatu/shared/format";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { fetchAccessibleBranches, fetchOrdersForDay } from "../../actions";
import { RevenueDrillTabs } from "./revenue-drill-tabs";

export interface OrderRow {
  order_id: number;
  order_number: string;
  branch_id: number;
  branch_name: string | null;
  paid_at: string;
  paid_hour: number;
  order_type: "dine_in" | "takeaway";
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string | null;
  item_count: number;
  invoice_status: string | null;
  invoice_number: string | null;
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export interface HourSummary {
  hour: number;
  order_count: number;
  total_revenue: number;
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
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">Ngày không hợp lệ.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/revenue">Về báo cáo doanh thu</Link>
        </Button>
      </div>
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
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/finance/revenue" className="gap-2">
            <IconArrowLeft className="size-4" />
            Quay lại
          </Link>
        </Button>
        <AppSection
          title={`Chọn chi nhánh để xem chi tiết ngày ${date}`}
          description='Drill-down từ chế độ "Tất cả chi nhánh" cần chọn cụ thể chi nhánh để hiển thị danh sách đơn theo giờ.'
        >
          {branches.length === 0 ? (
            <AppEmptyState compact title="Bạn chưa có quyền xem chi nhánh nào." />
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
      </div>
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
    branches.find((b) => b.id === branchId)?.name ?? `Chi nhánh ${branchId}`;
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
    <AppPage>
      <AppPageHeader
        eyebrow="Tài chính · Doanh thu"
        title={`${branchName} · ${date}`}
        description={`Tổng ${totalOrders.toLocaleString("vi-VN")} đơn · ${formatVND(totalRevenue)}. Cột giờ tính theo thời điểm thanh toán (Asia/Ho_Chi_Minh).`}
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/finance/revenue" className="gap-2">
              <IconArrowLeft className="size-4" />
              Quay lại tổng
            </Link>
          </Button>
        }
        badge={{ children: "Drill-down theo ngày", variant: "secondary" }}
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
