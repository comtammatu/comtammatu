"use client";

import Link from "next/link";
import {
  ClipboardCheck as IconClipboardCheck,
  FileText as IconFileText,
  ShoppingCart as IconShoppingCart,
  Bolt as IconBolt,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { AppPage, AppPageHeader } from "@/components/surface";
import { InteractiveCard } from "../_components/interactive-card";
import {
  InventoryWorkflowMap,
  type InventoryWorkflowStep,
} from "../_components/inventory-workflow";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tNav, tRoute } from "../_lib/dictionary";
import { formatVND } from "../_lib/format";
import type { RecentActivityItem } from "../procurement-actions";
import { messages } from "@lib/messages";

import { FORM_VI } from "@comtammatu/shared/messages";
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
    icon: IconShoppingCart,
    labelKey: "purchaseOrders" as const,
    href: "/inventory/purchase-orders",
    cta: "Quản lý đơn đặt hàng",
    description: "Tạo và theo dõi đơn đặt hàng trước khi nhận thực tế.",
    toneClassName: "text-primary",
    badgeClassName: "bg-primary/10 text-primary",
  },
  {
    key: "grn",
    icon: IconClipboardCheck,
    labelKey: "grn" as const,
    href: "/inventory/grn",
    cta: "Mở phiếu nhập",
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
    description: "Khóa công nợ với quy trình đối chiếu 3 bên (đơn–phiếu–hóa đơn).",
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
  const copy = messages.inventory.receiving;

  const countsByKey = {
    po: poCount,
    grn: grnCount,
    invoice: invoiceCount,
  } satisfies Record<(typeof WORKFLOW_STEPS)[number]["key"], number>;
  const workflowSteps: InventoryWorkflowStep[] = WORKFLOW_STEPS.map(
    (step, index) => {
      const count = countsByKey[step.key];
      return {
        key: step.key,
        title: tNav(step.labelKey, "heading"),
        description: step.description,
        href: step.href,
        icon: step.icon,
        metric: String(count),
        metricLabel: "đang mở",
        statusLabel: `Bước ${index + 1} · ${count} việc đang mở`,
        tone:
          step.key === "po"
            ? count > 0
              ? "primary"
              : "default"
            : step.key === "grn"
              ? count > 0
                ? "success"
                : "default"
              : count > 0
                ? "info"
                : "default",
        actions: [
          {
            label: step.cta,
            href: step.href,
            primary: index === 0,
          },
        ],
      };
    },
  );

  return (
    <AppPage width={isMobile ? "narrow" : "wide"}>
      <AppPageHeader
        density="compact"
        title={tRoute("/inventory/receiving", "heading")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/inventory/grn">{tNav("grn", "navigation")}</Link>
            </Button>
            <Button asChild>
              <Link href="/inventory/purchase-orders/new">
                <IconBolt className="size-4" />
                {copy.quickPo}
              </Link>
            </Button>
          </>
        }
      />
      <InventoryWorkflowMap steps={workflowSteps} />

      {/* Recent activity */}
      <Card>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="divide-y">
              <div className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {copy.activityTitle}
                </p>
              </div>
              {recentActivity.length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                      {copy.emptyActivityTitle}
                    </EmptyTitle>
                    <EmptyDescription className="text-xs leading-5">
                      {copy.emptyActivityDescription}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                recentActivity.map((item) => (
                  <InteractiveCard
                    key={`${item.type}-${item.id}`}
                    asChild
                    minHeight="tap"
                    padding="default"
                  >
                    <Link href={activityHref(item)} className="block">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-mono text-sm font-semibold">
                          {item.code}
                        </p>
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
                            {formatVND(item.total)}₫
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </InteractiveCard>
                ))
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">
                    {copy.table.documentCode}
                  </TableHead>
                  <TableHead className="min-w-44">
                    {copy.table.supplier}
                  </TableHead>
                  <TableHead className="min-w-32">{copy.table.time}</TableHead>
                  <TableHead className="min-w-32">{FORM_VI.status}</TableHead>
                  <TableHead className="min-w-28 text-right">
                    {FORM_VI.totalAmount}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.length === 0 ? (
                  <TableEmptyStateRow
                    colSpan={5}
                    title={copy.emptyActivityTitle}
                    description={copy.emptyActivityDescription}
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
                      <StatusBadge status={item.status} size="sm" />
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {item.total != null ? `${formatVND(item.total)}₫` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppPage>
  );
}
