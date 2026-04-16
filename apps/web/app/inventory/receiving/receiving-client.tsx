"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  Lightbulb,
  ShoppingCart,
  Zap,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tNav } from "../_lib/dictionary";
import { formatVND } from "../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";
import type { RecentActivityItem } from "../procurement-actions";

function activityHref(item: RecentActivityItem): string {
  if (item.type === "po") return `/inventory/purchase-orders/${item.id}`;
  if (item.type === "grn") return `/inventory/grn/${item.id}`;
  return "/inventory/supplier-invoices";
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

const WORKFLOW_STEPS = [
  {
    key: "po",
    icon: ShoppingCart,
    label: tNav("purchaseOrders", "heading"),
    href: "/inventory/purchase-orders",
    cta: "Quản lý PO",
    description: "Tạo và theo dõi đơn đặt hàng trước khi nhận thực tế.",
    toneClassName: "text-primary",
    badgeClassName: "bg-primary/10 text-primary",
  },
  {
    key: "grn",
    icon: ClipboardCheck,
    label: tNav("grn", "heading"),
    href: "/inventory/grn",
    cta: "Mở GRN",
    description: "Xác nhận số lượng nhận, batch và chi phí đầu vào.",
    toneClassName: "text-success",
    badgeClassName: "bg-success/10 text-success",
  },
  {
    key: "invoice",
    icon: FileText,
    label: tNav("supplierInvoices", "heading"),
    href: "/inventory/supplier-invoices",
    cta: "Đối soát hóa đơn",
    description: "Khóa công nợ với quy trình 3-way matching.",
    toneClassName: "text-info",
    badgeClassName: "bg-info/10 text-info",
  },
] as const;

export function ReceivingClient({
  poCount,
  grnCount,
  invoiceCount,
  recentActivity,
}: ReceivingProps) {
  const countsByKey = {
    po: poCount,
    grn: grnCount,
    invoice: invoiceCount,
  } satisfies Record<(typeof WORKFLOW_STEPS)[number]["key"], number>;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                HQ Procurement Hub
              </span>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {tNav("receiving", "heading")}
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Hub nhập hàng dành cho HQ: gom PO, GRN và hóa đơn NCC vào cùng
                  một nhịp để không lẫn với thao tác nhận transfer nội bộ của
                  chi nhánh.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button asChild variant="outline">
                <Link href="/inventory/grn">Mở GRN</Link>
              </Button>
              <Button asChild>
                <Link href="/inventory/purchase-orders/new">
                  <Zap className="size-4" />
                  Tạo PO nhanh
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = step.icon;

          return (
            <div
              key={step.key}
              className="rounded-lg border bg-card text-card-foreground shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <div
                    className={cn(
                      "inline-flex size-11 items-center justify-center rounded-full",
                      step.badgeClassName,
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-heading text-2xl font-semibold">
                      {step.label}
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="rounded-full">
                  Bước {index + 1}
                </Badge>
              </div>

              <div className="mt-5 flex items-end justify-between gap-3 rounded-[1.75rem] border border-border/60 bg-background/75 p-4">
                <div>
                  <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Đang mở
                  </p>
                  <p
                    className={cn(
                      "mt-2 text-4xl font-semibold",
                      step.toneClassName,
                    )}
                  >
                    {String(countsByKey[step.key]).padStart(2, "0")}
                  </p>
                </div>
                <p className="max-w-36 text-right text-sm text-muted-foreground">
                  Hồ sơ cần xử lý ở bước này.
                </p>
              </div>

              <Button
                asChild
                variant="outline"
                className="mt-4 w-full justify-between"
              >
                <Link href={step.href}>
                  {step.cta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Hoạt động gần đây</CardTitle>
              <p className="text-sm text-muted-foreground">
                Theo dõi PO, GRN và hóa đơn mới nhất trong cùng một dòng thời
                gian.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/inventory/supplier-invoices">Xem hóa đơn</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-4 sm:px-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">Mã phiếu</TableHead>
                  <TableHead className="min-w-44">Nhà cung cấp</TableHead>
                  <TableHead className="min-w-32">Thời gian</TableHead>
                  <TableHead className="min-w-32">Trạng thái</TableHead>
                  <TableHead className="min-w-28 text-right">
                    Tổng tiền
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.length === 0 ? (
                  <TableEmptyStateRow
                    colSpan={5}
                    title="Chưa có hoạt động nào"
                    description="PO, GRN và hóa đơn mới sẽ xuất hiện tại đây khi phát sinh."
                  />
                ) : null}
                {recentActivity.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`}>
                    <TableCell className="font-mono font-medium">
                      <Link
                        href={activityHref(item)}
                        className="text-primary transition hover:underline"
                      >
                        {item.code}
                      </Link>
                    </TableCell>
                    <TableCell>{item.supplier}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatActivityDate(item.date)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getInventoryStatusBadgeVariant(item.status)}
                      >
                        {getInventoryStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {item.total != null ? `${formatVND(item.total)}đ` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm border-info/20 bg-info/8">
            <div className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 size-5 shrink-0 text-info" />
              <div>
                <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Boundary HQ
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {recentActivity.length > 0
                    ? "Giữ chặt luồng PO → GRN → hóa đơn để tránh tồn đọng công nợ và lệch chi phí đầu vào giữa kho với kế toán. Nhận hàng nội bộ tại chi nhánh không đi qua hub này."
                    : "Khi bắt đầu phát sinh chứng từ, khu vực này sẽ giúp quản lý nhìn nhanh bottleneck của luồng nhập hàng HQ mà không trộn với flow chi nhánh."}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Tỷ trọng workflow HQ
            </p>
            <div className="mt-4 space-y-3">
              {WORKFLOW_STEPS.map((step) => (
                <div
                  key={step.key}
                  className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-border/60 bg-background/75 px-4 py-3"
                >
                  <span className="text-sm font-medium">{step.label}</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {String(countsByKey[step.key]).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
