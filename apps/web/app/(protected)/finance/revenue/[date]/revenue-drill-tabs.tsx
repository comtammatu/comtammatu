"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing finance revenue detail page keeps operational copy inline */

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Frame } from "@comtammatu/ui/components/frame";
import { Progress } from "@comtammatu/ui/components/progress";
import { formatVND } from "@comtammatu/shared/format";
import { AppEmptyState, AppSection } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFooterRow,
} from "@/components/data-table/data-table";
import { KpiCard } from "@/components/kpi/kpi-card";
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import { formatVNTime } from "@/_lib/format-datetime";
import type { HourSummary, OrderRow } from "./_lib/revenue-drill-types";

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Tại bàn",
  takeaway: "Mang về",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
};

function formatCount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

interface RevenueDrillTabsProps {
  orders: OrderRow[];
  hours: HourSummary[];
  totalOrders: number;
  totalRevenue: number;
  totalDiscount: number;
  totalTax: number;
}

function formatHourBucket(hour: number): string {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return `${start}:00-${end}:00`;
}

function invoiceBadge(row: OrderRow) {
  if (!row.invoice_status) {
    return <span className="text-xs text-muted-foreground">Chưa xuất</span>;
  }
  const label =
    row.invoice_status === "issued" && row.invoice_number
      ? `${getStatusBadgeMeta("tax-invoice", row.invoice_status).label} · ${row.invoice_number}`
      : undefined;
  return (
    <StatusBadge domain="tax-invoice" value={row.invoice_status} label={label} />
  );
}

export function RevenueDrillTabs({
  orders,
  hours,
  totalOrders,
  totalRevenue,
  totalDiscount,
  totalTax,
}: RevenueDrillTabsProps) {
  const orderColumns: DataTableColumn<OrderRow>[] = [
    {
      key: "time",
      header: "Giờ",
      className: "font-mono tabular-nums",
      render: (row) => formatVNTime(row.paid_at),
    },
    {
      key: "order",
      header: "Mã đơn",
      className: "font-mono text-xs",
      render: (row) => row.order_number,
    },
    {
      key: "type",
      header: "Loại",
      render: (row) => ORDER_TYPE_LABEL[row.order_type] ?? row.order_type,
    },
    {
      key: "branch",
      header: "Chi nhánh",
      className: "text-sm text-muted-foreground",
      render: (row) => row.branch_name?.replace(/^Chi nhánh\s+/, "") ?? "—",
    },
    {
      key: "items",
      header: "Món",
      className: "text-right font-mono tabular-nums",
      render: (row) => row.item_count,
    },
    {
      key: "payment",
      header: "Thanh toán",
      render: (row) =>
        row.payment_method
          ? (PAYMENT_METHOD_LABEL[row.payment_method] ?? row.payment_method)
          : "—",
    },
    {
      key: "discount",
      header: "Giảm",
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) =>
        Number(row.discount_amount) > 0 ? formatVND(row.discount_amount) : "—",
    },
    {
      key: "tax",
      header: "VAT",
      className: "text-right font-mono tabular-nums text-muted-foreground",
      render: (row) => formatVND(row.tax_amount),
    },
    {
      key: "total",
      header: "Tổng",
      className: "text-right font-mono tabular-nums font-medium",
      render: (row) => formatVND(row.total_amount),
    },
    {
      key: "invoice",
      header: "HĐĐT",
      render: (row) => invoiceBadge(row),
    },
  ];

  const footerRows: DataTableFooterRow[] = [
    {
      key: "total",
      className: "hover:bg-transparent",
      cells: [
        { key: "label", content: "Tổng", colSpan: 6, className: "font-medium" },
        {
          key: "discount",
          content: formatVND(totalDiscount),
          className: "text-right font-mono tabular-nums",
        },
        {
          key: "tax",
          content: formatVND(totalTax),
          className: "text-right font-mono tabular-nums",
        },
        {
          key: "total",
          content: formatVND(totalRevenue),
          className: "text-right font-mono tabular-nums font-bold",
        },
        { key: "invoice", content: "" },
      ],
    },
  ];

  return (
    <AppPageTabs
      items={[
        { value: "tong-quan", label: "Tổng quan" },
        { value: "theo-gio", label: "Theo giờ", count: hours.length },
        {
          value: "danh-sach-don",
          label: "Danh sách đơn",
          count: totalOrders,
        },
      ]}
      defaultValue="tong-quan"
      paramKey="tab"
    >
      <TabsContent value="tong-quan">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Doanh thu" value={formatVND(totalRevenue)} />
          <KpiCard label="Giảm giá" value={formatVND(totalDiscount)} />
          <KpiCard label="VAT" value={formatVND(totalTax)} />
        </div>
      </TabsContent>

      <TabsContent value="theo-gio">
        <AppSection title="Doanh thu theo giờ">
          {hours.length === 0 ? (
            <AppEmptyState
              compact
              title="Không có đơn trong ngày này."
              symbol="riceBowl"
            />
          ) : (
            hours.map((hour) => {
              const pct = totalRevenue
                ? Math.round((hour.total_revenue / totalRevenue) * 100)
                : 0;
              return (
                <div key={hour.hour} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium tabular-nums">
                      {formatHourBucket(hour.hour)}
                    </span>
                    <span className="tabular-nums">
                      {formatVND(hour.total_revenue)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {hour.order_count} đơn
                      </span>
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5 rounded-full" />
                </div>
              );
            })
          )}
        </AppSection>
      </TabsContent>

      <TabsContent value="danh-sach-don">
        <AppSection
          title={`Danh sách đơn (${formatCount(totalOrders)})`}
          description='Sắp xếp theo thời gian thanh toán. HĐĐT "Không yêu cầu" = khách lẻ không nhập MST.'
          contentFlush
          contentScroll
        >
          <DataTable
            columns={orderColumns}
            data={orders}
            getRowKey={(row) => row.order_id}
            emptyTitle="Không có đơn đã thanh toán trong ngày."
            mobileCardRender={(row) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{row.order_number}</ItemTitle>
                  <ItemDescription>
                    {formatVNTime(row.paid_at)} ·{" "}
                    {ORDER_TYPE_LABEL[row.order_type] ?? row.order_type}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <span className="text-xs text-muted-foreground">
                    {row.payment_method
                      ? (PAYMENT_METHOD_LABEL[row.payment_method] ??
                        row.payment_method)
                      : "—"}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatVND(row.total_amount)}
                  </span>
                </ItemFooter>
                <ItemFooter>{invoiceBadge(row)}</ItemFooter>
              </Item>
            )}
            desktopFooterRows={footerRows}
            mobileFooter={
              <Frame className="flex items-center justify-between bg-muted/30 p-3 text-sm">
                <span className="font-medium">Tổng</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatVND(totalRevenue)}
                </span>
              </Frame>
            }
          />
        </AppSection>
      </TabsContent>
    </AppPageTabs>
  );
}
