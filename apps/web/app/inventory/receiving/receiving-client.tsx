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
  CardDescription,
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
      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nhập kho
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">
                {tNav("receiving", "heading")}
              </CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                Điều phối xuyên suốt luồng đặt hàng, nhập kho và đối soát hóa
                đơn nhà cung cấp.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <Card key={step.key} className="border-border/70">
              <CardHeader className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div
                      className={cn(
                        "inline-flex size-10 items-center justify-center rounded-lg",
                        step.badgeClassName,
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{step.label}</CardTitle>
                      <CardDescription className="mt-1">
                        {step.description}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="rounded-full border border-border/70 bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                    Bước {index + 1}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                  className="w-full justify-between"
                >
                  <Link href={step.href}>
                    {step.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Hoạt động gần đây</CardTitle>
              <CardDescription>
                Theo dõi PO, GRN và hóa đơn mới nhất trong cùng một dòng thời
                gian.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/inventory/supplier-invoices">Xem hóa đơn</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
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
                    <TableRow
                      key={`${item.type}-${item.id}`}
                      className="hover:bg-muted/20"
                    >
                      <TableCell className="font-mono font-medium">
                        <Link
                          href={activityHref(item)}
                          className="text-primary hover:underline"
                        >
                          {item.code}
                        </Link>
                      </TableCell>
                      <TableCell>{item.supplier}</TableCell>
                      <TableCell className="text-muted-foreground">
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
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle className="text-base">Thao tác nhanh</CardTitle>
              <CardDescription>
                Mở trực tiếp các tuyến công việc dùng thường xuyên.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild className="justify-between">
                <Link href="/inventory/purchase-orders/new">
                  Tạo PO nhanh
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/inventory/grn">
                  Vào danh sách GRN
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/inventory/supplier-invoices">
                  Mở hóa đơn NCC
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2 text-primary">
                <Lightbulb className="size-4" />
                <CardTitle className="text-base">Nguyên tắc vận hành</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                Luôn khóa luồng nhận hàng theo thứ tự PO → GRN → Hóa đơn để đối
                chiếu đủ số lượng, giá và hạn thanh toán trước khi chốt công nợ.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
