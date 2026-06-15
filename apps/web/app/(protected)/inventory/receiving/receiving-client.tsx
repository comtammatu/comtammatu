"use client";

import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  ClipboardCheck as IconClipboardCheck,
  FileText as IconFileText,
  ShoppingCart as IconShoppingCart,
  Bolt as IconBolt,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  diffVNDateDays,
  formatVNDate,
  formatVNTime,
  getVNDateString,
} from "@comtammatu/shared/time";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { AppPage, AppPageHeader } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { tNav, tRoute } from "../_lib/dictionary";
import { formatVND } from "../_lib/format";
import type { RecentActivityItem } from "../procurement-actions";

import { FORM_VI } from "@comtammatu/shared/messages";
function activityHref(item: RecentActivityItem): string {
  if (item.type === "po") return `/inventory/purchase-orders/${item.id}`;
  if (item.type === "grn") return `/inventory/grn/${item.id}`;
  return "/inventory/supplier-invoices";
}

function formatActivityDate(iso: string): string {
  if (!iso) return "—";
  const diffDays = diffVNDateDays(getVNDateString(iso), getVNDateString());
  const hhmm = formatVNTime(iso);
  if (diffDays === 0) return `Hôm nay, ${hhmm}`;
  if (diffDays === 1) return `Hôm qua, ${hhmm}`;
  return `${formatVNDate(iso)}, ${hhmm}`;
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
    icon: IconShoppingCart,
    labelKey: "purchaseOrders" as const,
    href: "/inventory/purchase-orders",
    cta: "Quản lý PO",
    description: "Tạo và theo dõi đơn đặt hàng trước khi nhận thực tế.",
    toneClassName: "text-primary",
    badgeClassName: "bg-primary/10 text-primary",
  },
  {
    key: "grn",
    icon: IconClipboardCheck,
    labelKey: "grn" as const,
    href: "/inventory/grn",
    cta: "Mở GRN",
    description: "Xác nhận số lượng nhận, batch và chi phí đầu vào.",
    toneClassName: "text-success",
    badgeClassName: "bg-success/10 text-success",
  },
  {
    key: "invoice",
    icon: IconFileText,
    labelKey: "supplierInvoices" as const,
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
  const isMobile = useIsMobile();

  const countsByKey = {
    po: poCount,
    grn: grnCount,
    invoice: invoiceCount,
  } satisfies Record<(typeof WORKFLOW_STEPS)[number]["key"], number>;

  const activityColumns: DataTableColumn<RecentActivityItem>[] = [
    {
      key: "code",
      header: "Mã phiếu",
      className: "min-w-36",
      render: (item) => (
        <Link
          href={activityHref(item)}
          className="font-mono font-medium text-primary transition hover:underline"
        >
          {item.code}
        </Link>
      ),
    },
    {
      key: "supplier",
      header: "Nhà cung cấp",
      className: "min-w-44",
      render: (item) => item.supplier,
    },
    {
      key: "date",
      header: "Thời gian",
      className: "min-w-32",
      render: (item) => (
        <span className="text-sm text-muted-foreground">
          {formatActivityDate(item.date)}
        </span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      className: "min-w-32",
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: "total",
      header: FORM_VI.totalAmount,
      className: "min-w-28 text-right",
      render: (item) => (
        <span className="font-mono font-semibold">
          {item.total != null ? formatVND(item.total) : "—"}
        </span>
      ),
    },
  ];

  const renderActivityCard = (item: RecentActivityItem) => (
    <InteractiveCard asChild minHeight="tap" padding="default">
      <Link href={activityHref(item)} className="block">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-sm font-semibold">{item.code}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.supplier}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={item.status} size="sm" />
          <span className="text-xs text-muted-foreground">
            {formatActivityDate(item.date)}
          </span>
          {item.total != null ? (
            <span className="font-mono text-xs font-semibold">
              {formatVND(item.total)}
            </span>
          ) : null}
        </div>
      </Link>
    </InteractiveCard>
  );

  return (
    <AppPage width={isMobile ? "narrow" : "wide"}>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={tRoute("/inventory/receiving", "heading")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/inventory/grn">{tNav("grn", "navigation")}</Link>
            </Button>
            <Button asChild>
              <Link href="/inventory/purchase-orders/new">
                <IconBolt className="size-4" />
                Tạo PO nhanh
              </Link>
            </Button>
          </>
        }
      />
      {/* Pipeline cards */}
      <div className="grid gap-4 xl:grid-cols-3">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const label = tNav(step.labelKey, "heading");

          return isMobile ? (
            <InteractiveCard
              key={step.key}
              asChild
              minHeight="mobile"
              padding="default"
            >
              <Link href={step.href} className="block">
                <div
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
                    step.badgeClassName,
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    Bước {index + 1} &middot; {countsByKey[step.key]} đang mở
                  </p>
                </div>
                <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </InteractiveCard>
          ) : (
            <Card key={step.key}>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "inline-flex size-10 items-center justify-center rounded-full",
                      step.badgeClassName,
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      Bước {index + 1} &middot; {countsByKey[step.key]} đang mở
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full justify-between"
                >
                  <Link href={step.href}>
                    {step.cta}
                    <IconArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent activity */}
      <Card>
        <CardContent flush>
          <DataTable
            columns={activityColumns}
            data={recentActivity}
            getRowKey={(item) => `${item.type}-${item.id}`}
            emptyTitle="Chưa có hoạt động nào"
            emptyDescription="PO, GRN và hóa đơn mới sẽ xuất hiện tại đây khi phát sinh."
            emptyMode="no-data"
            mobileCardRender={renderActivityCard}
          />
        </CardContent>
      </Card>
    </AppPage>
  );
}
