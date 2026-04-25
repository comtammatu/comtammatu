"use client";

import Link from "next/link";
import {
  ArrowLeftRight as IconArrowLeftRight,
  ChartBar as IconChartBar,
  ClipboardList as IconClipboardList,
  Factory as IconBuildingFactory,
  Package as IconPackage,
  Receipt as IconReceipt,
  ShoppingCart as IconShoppingCart,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { InventoryHeader } from "./_components/inventory-header";
import { InventoryPageContent } from "./_components/inventory-page-layout";
import { InventoryStatChip } from "./_components/inventory-stat-chip";
import { PlaybookFeed } from "./_components/playbook-feed";
import { branchHrefOrPath } from "./_lib/href";
import { formatVND } from "./_lib/format";
import { getInventoryPaths, type InventoryRouteBase } from "./_lib/paths";
import { tNav } from "./_lib/dictionary";
import type { PlaybookTask } from "./_lib/playbook-types";

type DashboardSiteKind = "central_warehouse" | "central_kitchen" | "branch";

export type DashboardProps = {
  routeBase: InventoryRouteBase;
  siteName: string;
  siteKind: DashboardSiteKind;
  showProcurement: boolean;
  totalStockValue: number;
  pendingPO: number;
  activeTransfers: number;
  activeStocktakes: number;
  priceReviewCount: number;
  pendingSupplierReturns: number;
  reorderAlerts: Array<{
    ingredientId: number;
    branchId: number;
    name: string;
    current: number;
    reorder: number;
    unit: string;
  }>;
  expiryAlerts: Array<{
    id: number;
    ingredientName: string;
    lot: string;
    expiryDate: string;
    daysLeft: number;
    urgency: string;
  }>;
  transfers: Array<{
    id: number;
    code: string;
    fromBranch: string;
    toBranch: string;
    status: string;
  }>;
  stocktakeSessions: Array<{
    id: number;
    code: string;
    branchName: string;
    progress: number;
    status: string;
  }>;
  playbookTasks: PlaybookTask[];
  playbookBranchId: number | null;
  playbookBranchKind: DashboardSiteKind;
  defaultSupplyBranchId: number | null;
};

/**
 * Quick actions per site kind. Lives below the KPI strip and above the
 * playbook feed — secondary navigation entry points that the playbook may
 * not surface (e.g. blank PO, blank transfer).
 */
function buildQuickActions(
  siteKind: DashboardSiteKind,
  routeBase: InventoryRouteBase,
) {
  const p = getInventoryPaths(routeBase);

  if (siteKind === "central_warehouse")
    return [
      {
        label: "Nhập nguyên liệu",
        icon: IconShoppingCart,
        href: p.receiving,
        primary: true,
      },
      { label: tNav("transfers"), icon: IconArrowLeftRight, href: p.transfers },
      { label: tNav("stocktake"), icon: IconClipboardList, href: p.stocktake },
      { label: tNav("reports"), icon: IconChartBar, href: p.reports },
    ];

  if (siteKind === "central_kitchen")
    return [
      {
        label: "Tạo lệnh sản xuất",
        icon: IconBuildingFactory,
        href: p.production,
        primary: true,
      },
      { label: "Xuất thành phẩm", icon: IconPackage, href: p.transfers },
      { label: tNav("stocktake"), icon: IconClipboardList, href: p.stocktake },
      { label: tNav("reports"), icon: IconChartBar, href: p.reports },
    ];

  return [
    {
      label: "Nhận điều chuyển",
      icon: IconArrowLeftRight,
      href: p.transfers,
      primary: true,
    },
    { label: tNav("stock"), icon: IconPackage, href: p.stock },
    { label: tNav("issues"), icon: IconReceipt, href: p.issues },
    { label: tNav("stocktake"), icon: IconClipboardList, href: p.stocktake },
  ];
}

export function DashboardClient(props: DashboardProps) {
  const {
    routeBase,
    siteName,
    siteKind,
    showProcurement,
    totalStockValue,
    pendingPO,
    activeTransfers,
    activeStocktakes,
    priceReviewCount,
    pendingSupplierReturns,
    expiryAlerts,
    playbookTasks,
    playbookBranchId,
    playbookBranchKind,
    defaultSupplyBranchId,
  } = props;

  const isMobile = useIsMobile();
  const quickActions = buildQuickActions(siteKind, routeBase);

  return (
    <>
      <InventoryHeader
        title={tNav("home")}
        description={`${siteName} • ${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />

      <InventoryPageContent
        width={isMobile ? "narrow" : "wide"}
        contentClassName="gap-4"
      >
        {/* Slim KPI strip — one row, signal only. No big cards. */}
        <div className="flex flex-wrap items-center divide-x overflow-hidden border bg-card">
          <InventoryStatChip
            kind="info"
            label="Giá trị tồn"
            value={`${formatVND(totalStockValue)}đ`}
          />
          <InventoryStatChip
            kind="link"
            label="PO đang mở"
            value={String(pendingPO)}
            disabled={pendingPO === 0}
            href={branchHrefOrPath(
              props.playbookBranchId,
              "/inventory/purchase-orders",
              { filter: "draft" },
            )}
          />
          <InventoryStatChip
            kind="link"
            label="Phiếu chuyển đang xử lý"
            value={String(activeTransfers)}
            disabled={activeTransfers === 0}
            href={branchHrefOrPath(
              props.playbookBranchId,
              "/inventory/transfers",
            )}
          />
          <InventoryStatChip
            kind="link"
            label="Phiên kiểm kê đang mở"
            value={String(activeStocktakes)}
            disabled={activeStocktakes === 0}
            href={branchHrefOrPath(
              props.playbookBranchId,
              "/inventory/stocktake",
            )}
          />
          <InventoryStatChip
            kind="link"
            label="Cảnh báo hết hạn"
            value={String(expiryAlerts.length)}
            tone={expiryAlerts.length > 0 ? "warning" : "default"}
            disabled={expiryAlerts.length === 0}
            href={branchHrefOrPath(
              props.playbookBranchId,
              "/inventory/expiry",
            )}
          />
          {showProcurement ? (
            <>
              <InventoryStatChip
                kind="link"
                label="GRN cần kiểm giá (30d)"
                value={String(priceReviewCount)}
                tone={priceReviewCount > 0 ? "destructive" : "default"}
                disabled={priceReviewCount === 0}
                href={branchHrefOrPath(
                  props.playbookBranchId,
                  "/inventory/grn",
                  { priceReview: "1" },
                )}
              />
              <InventoryStatChip
                kind="link"
                label="Phiếu trả NCC mở"
                value={String(pendingSupplierReturns)}
                tone={pendingSupplierReturns > 0 ? "warning" : "default"}
                disabled={pendingSupplierReturns === 0}
                href={branchHrefOrPath(
                  props.playbookBranchId,
                  "/inventory/supplier-returns",
                )}
              />
            </>
          ) : null}
        </div>

        {/* Quick actions — slim row of common navigation shortcuts. */}
        <div className="flex flex-wrap items-center gap-2 border bg-card p-2">
          <Badge variant="outline" className="text-xs">
            Thao tác nhanh
          </Badge>
          {quickActions.map((a) => (
            <Button
              key={a.label}
              asChild
              size="sm"
              variant={a.primary ? "default" : "outline"}
            >
              <Link href={a.href}>
                <a.icon className="size-3.5" />
                {a.label}
              </Link>
            </Button>
          ))}
        </div>

        {/* Today's Playbook — primary surface */}
        <PlaybookFeed
          tasks={playbookTasks}
          branchId={playbookBranchId}
          branchKind={playbookBranchKind}
          emptySnapshot={{
            pendingPoCount: pendingPO,
            activeTransfers,
            activeStocktakes,
          }}
          defaultSupplyBranchId={defaultSupplyBranchId}
        />
      </InventoryPageContent>
    </>
  );
}
