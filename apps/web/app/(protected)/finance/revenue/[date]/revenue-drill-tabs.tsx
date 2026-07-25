"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing finance revenue detail page keeps operational copy inline */

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import Link from "next/link";
import { Frame } from "@comtammatu/ui/components/frame";
import { Progress } from "@comtammatu/ui/components/progress";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { AppEmptyState, AppSection } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFooterRow,
} from "@/components/data-table/data-table";
import { KpiCard } from "@/components/kpi/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { formatVNTime } from "@/_lib/format-datetime";
import type { HourSummary, OrderRow } from "./_lib/revenue-drill-types";

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Tại bàn",
  takeaway: "Mang về",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
};

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
    return (
      <span className="max-w-48 break-all text-xs text-muted-foreground">
        Chưa có bằng chứng HĐĐT
      </span>
    );
  }
  const label =
    row.invoice_status === "issued" && row.invoice_number
      ? `${row.invoice_kind === "daily_summary" ? "HĐ ngày" : "HĐ đơn"} · ${row.invoice_number}`
      : undefined;
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge
        domain="tax-invoice"
        value={row.invoice_status}
        label={label}
      />
      <span className="text-xs text-muted-foreground">
        {formatCount(row.invoice_evidence.length)} bằng chứng
        {row.invoice_provider_ref
          ? ` · Ref ${row.invoice_provider_ref}`
          : ""}
      </span>
    </div>
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
      render: (row) => (
        <Link
          href={`/orders?orderId=${String(row.order_id)}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.order_number}
        </Link>
      ),
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
      header: "Số lượng",
      className: "text-right font-mono text-xs tabular-nums",
      render: (row) => {
        const sideQuantity =
          row.side_dish_quantity + row.included_side_quantity;
        return (
          <span
            className="flex flex-col"
            title={`${String(row.item_row_count)} dòng món`}
          >
            <span>
              {formatCount(row.item_count)} món ·{" "}
              {formatCount(row.main_dish_quantity)} cơm snapshot ·{" "}
              {formatCount(sideQuantity)} kèm
            </span>
            {row.legacy_unclassified_quantity > 0 && (
              <span className="text-muted-foreground">
                {formatCount(row.legacy_unclassified_quantity)} món cũ chưa phân
                loại · ước tính hiện tại{" "}
                {formatCount(row.legacy_current_main_dish_quantity)} cơm
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "evidence",
      header: "Vận hành",
      className: "text-xs",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span>
            KDS {formatCount(row.kds_completed_item_quantity)} · In{" "}
            {formatCount(row.printed_job_count)}/
            {formatCount(row.print_job_count)}
          </span>
          {row.kds_legacy_completed_item_quantity > 0 && (
            <span className="text-warning">
              Snapshot KDS cũ{" "}
              {formatCount(row.kds_legacy_completed_item_quantity)} món; bằng
              chứng không đầy đủ
            </span>
          )}
          {row.print_failed_count > 0 && (
            <span className="text-destructive">
              {formatCount(row.print_failed_count)} phiếu in lỗi
            </span>
          )}
          <span className="text-muted-foreground">
            {row.pos_session_id ? (
              <Link
                href={`/br/${String(row.branch_id)}/pos-sessions?session=${String(row.pos_session_id)}`}
                className="underline-offset-4 hover:underline"
              >
                Ca #{String(row.pos_session_id)}
              </Link>
            ) : (
              "Không có ca"
            )}
            {" · "}
            {formatCount(row.audit_event_count)} audit
          </span>
        </div>
      ),
    },
    {
      key: "payment",
      header: "Thanh toán",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span>
            {row.payment_method
              ? (PAYMENT_METHOD_LABEL[row.payment_method] ?? row.payment_method)
              : "—"}
          </span>
          {row.reconciliation_status === "missing" ? (
            <span className="text-xs text-destructive">
              Thiếu đối soát canonical
            </span>
          ) : row.order_payment_state_mismatch ? (
            <span className="text-xs text-destructive">
              Payment hoàn tất nhưng trạng thái đơn lệch
            </span>
          ) : row.payment_attempt_count > 1 ? (
            <span className="text-xs text-muted-foreground">
              {formatCount(row.payment_attempt_count)} lượt thử
            </span>
          ) : null}
        </div>
      ),
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
      render: (row) => (
        <span
          className={
            Number(row.total_amount) !== Number(row.order_total_amount)
              ? "text-destructive"
              : undefined
          }
          title={`Tổng trên đơn: ${formatVND(row.order_total_amount)}`}
        >
          {formatVND(row.total_amount)}
        </span>
      ),
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
        { key: "label", content: "Tổng", colSpan: 7, className: "font-medium" },
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
          label: "Đơn",
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
                        {formatCount(hour.order_count)} đơn
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
          title={`Đơn có payment hoàn tất (${formatCount(totalOrders)})`}
          description={`Mỗi đơn một dòng, sắp xếp theo payments.paid_at. "Không yêu cầu" chỉ hiển thị khi hệ thống đã ghi nhận trạng thái đó.`}
          contentFlush
          contentScroll
        >
          <DataTable
            columns={orderColumns}
            data={orders}
            pageSize={50}
            getRowKey={(row) => row.order_id}
            emptyTitle="Không có đơn với payment hoàn tất trong ngày."
            mobileCardRender={(row) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{row.order_number}</ItemTitle>
                  <ItemDescription>
                    {formatVNTime(row.paid_at)} ·{" "}
                    {ORDER_TYPE_LABEL[row.order_type] ?? row.order_type}
                  </ItemDescription>
                  <ItemDescription>
                    {formatCount(row.main_dish_quantity)} cơm snapshot ·{" "}
                    {formatCount(
                      row.side_dish_quantity + row.included_side_quantity,
                    )}{" "}
                    kèm · KDS {formatCount(row.kds_completed_item_quantity)} ·
                    In {formatCount(row.printed_job_count)}/
                    {formatCount(row.print_job_count)}
                  </ItemDescription>
                  {row.kds_legacy_completed_item_quantity > 0 && (
                    <ItemDescription className="text-warning">
                      Snapshot KDS cũ{" "}
                      {formatCount(row.kds_legacy_completed_item_quantity)} món;
                      bằng chứng không đầy đủ
                    </ItemDescription>
                  )}
                  {row.legacy_unclassified_quantity > 0 && (
                    <ItemDescription>
                      {formatCount(row.legacy_unclassified_quantity)} món cũ
                      chưa phân loại; ước tính hiện tại{" "}
                      {formatCount(row.legacy_current_main_dish_quantity)} cơm
                    </ItemDescription>
                  )}
                  {row.order_payment_state_mismatch && (
                    <ItemDescription className="text-destructive">
                      Payment hoàn tất nhưng trạng thái đơn lệch
                    </ItemDescription>
                  )}
                  {row.reconciliation_status === "missing" && (
                    <ItemDescription className="text-destructive">
                      Thiếu đối soát canonical
                    </ItemDescription>
                  )}
                  {row.print_failed_count > 0 && (
                    <ItemDescription className="text-destructive">
                      {formatCount(row.print_failed_count)} phiếu in lỗi
                    </ItemDescription>
                  )}
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
