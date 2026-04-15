"use client";

import Link from "next/link";
import { SectionCard } from "@/components/foundation/ui-patterns";
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  Lightbulb,
  ShoppingCart,
  Zap,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn, getSurfacePanelClassName } from "@comtammatu/ui";
import { PageHeader, StatusBadge } from "../_components/shared";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tNav } from "../_lib/dictionary";
import { formatVND } from "../_lib/format";
import type { RecentActivityItem } from "../procurement-actions";

function activityHref(item: RecentActivityItem): string {
  if (item.type === "po") return `/inventory/purchase-orders/${item.id}`;
  if (item.type === "grn") return `/inventory/grn/${item.id}`;
  return `/inventory/supplier-invoices`;
}

function formatActivityDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  const hhmm = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffDays === 0) return `Hôm nay, ${hhmm}`;
  if (diffDays === 1) return `Hôm qua, ${hhmm}`;
  return (
    date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) +
    `, ${hhmm}`
  );
}

export type ReceivingProps = {
  poCount: number;
  grnCount: number;
  invoiceCount: number;
  recentActivity: RecentActivityItem[];
};

export function ReceivingClient({
  poCount,
  grnCount,
  invoiceCount,
  recentActivity,
}: ReceivingProps) {
  const panelClassName = getSurfacePanelClassName(
    "inventory",
    "ambient-shadow",
  );
  const steps = [
    {
      step: 1,
      icon: ShoppingCart,
      label: tNav("purchaseOrders", "heading"),
      count: poCount,
      sub: "Đơn đang chờ duyệt/gửi",
      href: "/inventory/purchase-orders",
      btnLabel: "Quản lý đơn đặt hàng NCC",
      toneClassName: "text-primary",
      stepClassName: "bg-primary text-primary-foreground",
      ctaClassName: "border-primary/15 bg-primary/8 text-primary",
    },
    {
      step: 2,
      icon: ClipboardCheck,
      label: tNav("grn", "heading"),
      count: grnCount,
      sub: "Phiếu đang chờ xác nhận",
      href: "/inventory/grn",
      btnLabel: "Quản lý phiếu nhập kho",
      toneClassName: "text-success",
      stepClassName: "bg-success text-success-foreground",
      ctaClassName: "border-success/20 bg-success/10 text-success",
    },
    {
      step: 3,
      icon: FileText,
      label: tNav("supplierInvoices", "heading"),
      count: invoiceCount,
      sub: "Hóa đơn cần đối soát 3-way",
      href: "/inventory/supplier-invoices",
      btnLabel: "Quản lý hóa đơn NCC",
      toneClassName: "text-info",
      stepClassName: "bg-info text-info-foreground",
      ctaClassName: "border-info/20 bg-info/10 text-info",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={tNav("receiving", "heading")}
        description="Theo dõi chuỗi PO, GRN và hóa đơn nhà cung cấp."
      />

      {/* Workflow Stepper Bento Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((item) => {
          const Icon = item.icon;
          return (
            <SectionCard
              key={item.step}
              className={cn(
                panelClassName,
                "group relative overflow-hidden rounded-3xl bg-card shadow-sm transition-shadow hover:shadow-md",
              )}
              density="touch"
            >
              {/* Watermark icon */}
              <div className="absolute right-4 top-4 opacity-5 transition-opacity group-hover:opacity-10">
                <Icon className="size-24" />
              </div>

              {/* Step number + label */}
              <div className="mb-6 flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full font-bold",
                    item.stepClassName,
                  )}
                >
                  {item.step}
                </span>
                <h3 className="text-lg font-bold leading-tight sm:text-xl">
                  {item.label}
                </h3>
              </div>

              {/* Count */}
              <div className="mb-8">
                <span
                  className={cn(
                    "text-4xl font-black tracking-tighter",
                    item.toneClassName,
                  )}
                >
                  {String(item.count).padStart(2, "0")}
                </span>
                <p className="mt-1 text-sm text-muted-foreground">{item.sub}</p>
              </div>

              {/* CTA button */}
              <Link
                href={item.href}
                className={cn(
                  "focus-ring-standard flex w-full whitespace-nowrap items-center justify-center gap-2 rounded-full border py-3 text-sm font-bold transition-all",
                  item.ctaClassName,
                )}
              >
                {item.btnLabel}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </SectionCard>
          );
        })}
      </div>

      {/* Activity + Sidebar */}
      <div className="grid gap-8 lg:grid-cols-4">
        {/* Recent Activity Table */}
        <div className="lg:col-span-3">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold">Hoạt động gần đây</h3>
            <button
              type="button"
              className="focus-ring-standard rounded-sm text-sm font-semibold text-primary hover:underline"
            >
              Xem tất cả
            </button>
          </div>
          <div
            className={cn(
              panelClassName,
              "overflow-hidden rounded-3xl bg-card",
            )}
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {[
                    "Mã Phiếu",
                    "Nhà Cung Cấp",
                    "Ngày",
                    "Trạng Thái",
                    "Tổng Tiền",
                  ].map((h) => (
                    <TableHead
                      key={h}
                      className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wide text-muted-foreground ${h === "Tổng Tiền" ? "text-right" : ""}`}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={5}
                    title="Chưa có hoạt động nào"
                    description="PO, GRN và hóa đơn mới sẽ xuất hiện ở đây khi phát sinh."
                  />
                )}
                {recentActivity.map((item) => (
                  <TableRow
                    key={item.code}
                    className="border-border/40 transition-colors"
                  >
                    <TableCell className="px-6 py-4 font-mono text-sm font-medium">
                      <Link
                        href={activityHref(item)}
                        className="focus-ring-standard rounded-sm text-primary hover:underline"
                      >
                        {item.code}
                      </Link>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm font-semibold">
                      {item.supplier}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                      {formatActivityDate(item.date)}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right text-sm font-bold text-primary">
                      {item.total != null ? `${formatVND(item.total)}đ` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className={cn(panelClassName, "rounded-3xl bg-card p-5")}>
            <h4 className="mb-3 text-sm font-semibold">Thao tác nhanh</h4>
            <div className="space-y-2">
              <Link
                href="/inventory/purchase-orders/new"
                className="focus-ring-standard flex w-full items-center gap-2 rounded-full border border-border/60 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Zap className="size-4 text-primary" />
                Tạo PO nhanh
              </Link>
              <button
                type="button"
                className="focus-ring-standard flex w-full items-center gap-2 rounded-full border border-border/60 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Nhập hàng không qua PO
              </button>
            </div>
          </div>

          {/* Tip Card */}
          <div className="rounded-3xl border border-primary/10 bg-primary/5 p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" />
              <p className="text-xs font-semibold text-muted-foreground">
                Mẹo quản lý
              </p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Sử dụng quy trình 3-way matching để đảm bảo số lượng nhận thực tế
              khớp với đơn đặt và hóa đơn nhà cung cấp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
