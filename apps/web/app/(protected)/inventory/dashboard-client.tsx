"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  TriangleAlert as IconAlertTriangle,
  ArrowLeftRight as IconArrowLeftRight,
  ArrowRight as IconArrowRight,
  SquareCheck as IconSquareCheck,
  ClipboardList as IconClipboardList,
  Clock as IconClock,
  Hourglass as IconHourglass,
  Receipt as IconReceipt,
  ShoppingCart as IconShoppingCart,
  Truck as IconTruck,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppPageHeader,
  AppSection,
  type AppLinkCardProps,
} from "@/components/surface";
import { formatVND } from "./_lib/format";
import { getInventoryPaths, type InventoryRouteBase } from "./_lib/paths";
import { tNav, tStatus } from "./_lib/dictionary";
import { messages } from "@lib/messages";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

import { ACTIONS_VI } from "@comtammatu/shared/messages";
type DashboardSiteKind = "branch" | "central_supply" | "central_kitchen";

export type DashboardProps = {
  routeBase: InventoryRouteBase;
  siteName: string;
  siteKind: DashboardSiteKind;
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  selectedBranchId: number | null;
  totalStockValue: number;
  pendingPO: number;
  activeTransfers: number;
  activeStocktakes: number;
  priceReviewCount: number;
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
};

type FlowAction = {
  label: string;
  href: string;
  primary?: boolean;
};

type FlowCard = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  metric: string;
  metricLabel: string;
  statusLabel: string;
  tone: "default" | "destructive" | "warning" | "info" | "success";
  actions: FlowAction[];
};

function appendBranchId(href: string, branchId: number | null): string {
  if (branchId == null || href.includes("branchId=")) return href;
  return `${href}${href.includes("?") ? "&" : "?"}branchId=${branchId}`;
}

function isInventoryOversightRole(role: StaffRole): boolean {
  return role === "owner";
}

function buildFlowCards(props: DashboardProps): FlowCard[] {
  const paths = getInventoryPaths(props.routeBase);
  const openTransfers = props.transfers.filter((t) => isTransferOpen(t.status));
  const inbound = openTransfers.filter((t) => t.toBranch === props.siteName);
  const outbound = openTransfers.filter((t) => t.fromBranch === props.siteName);
  const exceptionCount =
    props.activeStocktakes +
    props.expiryAlerts.length +
    props.reorderAlerts.length +
    props.priceReviewCount;

  if (isInventoryOversightRole(props.userRole)) {
    return [
      {
        key: "oversight-stock",
        title: "1. Tình hình tồn",
        description:
          "Xem giá trị tồn, tồn thấp và các điểm cần quản lý theo phạm vi được phân quyền.",
        href: paths.stock,
        icon: IconClipboardList,
        metric: String(exceptionCount),
        metricLabel: "điểm cần xem",
        statusLabel: `${props.reorderAlerts.length} tồn thấp / ${props.expiryAlerts.length} hạn dùng`,
        tone:
          props.expiryAlerts.length > 0 || props.reorderAlerts.length > 0
            ? "warning"
            : "default",
        actions: [
          { label: "Xem tồn", href: paths.stock, primary: true },
          { label: tNav("reports", "navigation"), href: paths.reports },
        ],
      },
      {
        key: "oversight-alerts",
        title: "2. Cảnh báo ưu tiên",
        description:
          "Theo dõi lô cận hạn, tồn thấp và điểm lệch cần quản lý xử lý tiếp.",
        href: paths.expiry,
        icon: IconHourglass,
        metric: String(props.expiryAlerts.length + props.reorderAlerts.length),
        metricLabel: "cảnh báo",
        statusLabel: `${props.expiryAlerts.length} hạn dùng / ${props.reorderAlerts.length} tồn thấp`,
        tone:
          props.expiryAlerts.length > 0 || props.reorderAlerts.length > 0
            ? "warning"
            : "default",
        actions: [
          { label: "Xem cảnh báo", href: paths.expiry, primary: true },
          { label: tNav("reports", "navigation"), href: paths.reports },
        ],
      },
      {
        key: "oversight-movement",
        title: "3. Luồng đang xử lý",
        description:
          "Theo dõi phiếu đang chạy giữa các điểm vận hành mà không mở hành động thao tác trực tiếp.",
        href: paths.transfers,
        icon: IconArrowLeftRight,
        metric: String(props.activeTransfers),
        metricLabel: "phiếu đang chạy",
        statusLabel: `${inbound.length} đến / ${outbound.length} đi`,
        tone: props.activeTransfers > 0 ? "info" : "default",
        actions: [
          { label: "Theo dõi", href: paths.transfers, primary: true },
          { label: tNav("reports", "navigation"), href: paths.reports },
        ],
      },
    ];
  }

  const sourceActions: FlowAction[] = props.showProcurement
    ? [
        {
          label: tNav("purchaseOrders", "navigation"),
          href: paths.purchaseOrders,
          primary: true,
        },
        { label: tNav("grn", "navigation"), href: paths.grn },
      ]
    : [
        { label: "Phiếu đến", href: paths.transfers, primary: true },
        { label: tNav("stock", "navigation"), href: paths.stock },
      ];

  const movementActions: FlowAction[] = [
    {
      label:
        props.siteKind === "branch"
          ? "Nhận/điều chuyển hàng"
          : tNav("transfers", "navigation"),
      href: paths.transfers,
      primary: true,
    },
  ];

  if (props.showProduction) {
    movementActions.push({ label: "Lệnh sản xuất", href: paths.production });
  }

  if (props.siteKind === "branch") {
    movementActions.push({
      label: "Tiêu hao",
      href: paths.consumption,
    });
  }

  return [
    {
      key: "control",
      title: "1. Kiểm soát tồn",
      description:
        "Nắm tồn hiện tại, kiểm kê, hạn dùng, tồn thấp và các lệch số cần xử lý trong ngày.",
      href: paths.stocktake,
      icon: IconClipboardList,
      metric: String(exceptionCount),
      metricLabel: "điểm cần kiểm soát",
      statusLabel: `${props.activeStocktakes} kiểm kê / ${props.expiryAlerts.length} hạn dùng`,
      tone:
        props.expiryAlerts.length > 0 || props.reorderAlerts.length > 0
          ? "warning"
          : props.activeStocktakes > 0
            ? "success"
            : "default",
      actions: [
        {
          label: tNav("stocktake", "navigation"),
          href: paths.stocktake,
          primary: true,
        },
        { label: tNav("expiry", "navigation"), href: paths.expiry },
        { label: tNav("issues", "navigation"), href: paths.issues },
        { label: tNav("reports", "navigation"), href: paths.reports },
      ],
    },
    {
      key: "source",
      title: "2. Nhập - Nhận hàng - Đối soát",
      description: props.showProcurement
        ? "Theo dõi PO, GRN, hóa đơn NCC và lệch giá/số lượng trước khi hàng vào tồn."
        : "Chi nhánh nhận hàng qua điều chuyển nội bộ và đối soát số thực nhận.",
      href: props.showProcurement ? paths.purchaseOrders : paths.transfers,
      icon: props.showProcurement ? IconShoppingCart : IconTruck,
      metric: String(props.showProcurement ? props.pendingPO : inbound.length),
      metricLabel: props.showProcurement ? "PO đang chờ" : "phiếu đến",
      statusLabel: props.showProcurement
        ? `${props.priceReviewCount} dòng cần đối soát`
        : `${inbound.length} phiếu cần nhận`,
      tone:
        (props.showProcurement && props.pendingPO > 0) || inbound.length > 0
          ? "info"
          : "default",
      actions: sourceActions,
    },
    {
      key: "movement",
      title: "3. Điều phối và sản xuất",
      description:
        "Theo dõi phiếu hàng còn giữ tồn sau khi nhận và lệnh sản xuất trung tâm.",
      href: paths.transfers,
      icon: IconArrowLeftRight,
      metric: String(props.activeTransfers),
      metricLabel: "phiếu đang chạy",
      statusLabel: `${inbound.length} đến / ${outbound.length} đi`,
      tone: props.activeTransfers > 0 ? "info" : "default",
      actions: movementActions,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Task / alert builders                                              */
/* ------------------------------------------------------------------ */

function isTransferOpen(status: string) {
  return [
    "draft",
    "confirmed",
    "confirmed_ship",
    "in_transit",
    "confirmed_receive",
  ].includes(status);
}

type TaskItem = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  severity: "destructive" | "warning" | "info" | "success" | "primary";
};

const taskLinkTone: Record<
  TaskItem["severity"],
  NonNullable<AppLinkCardProps["tone"]>
> = {
  destructive: "warning",
  warning: "warning",
  info: "info",
  success: "success",
  primary: "primary",
};

const taskBadge: Record<
  TaskItem["severity"],
  {
    label: string;
    variant: NonNullable<AppLinkCardProps["badgeVariant"]>;
  }
> = {
  destructive: { label: "Ưu tiên", variant: "destructive" },
  warning: { label: "Cần xử lý", variant: "warning" },
  info: { label: "Theo dõi", variant: "info" },
  success: { label: "Đang mở", variant: "success" },
  primary: { label: "Tiếp tục", variant: "default" },
};

function buildTasks(props: DashboardProps): TaskItem[] {
  const {
    siteKind,
    siteName,
    showProcurement,
    activeTransfers,
    reorderAlerts,
    expiryAlerts,
    transfers,
  } = props;
  const paths = getInventoryPaths(props.routeBase);
  const items: TaskItem[] = [];
  const open = transfers.filter((t) => isTransferOpen(t.status));
  const inbound = open.filter((t) => t.toBranch === siteName);
  const isOversight = isInventoryOversightRole(props.userRole);

  if (isOversight) {
    if (activeTransfers > 0)
      items.push({
        key: "oversight-flow",
        title: `${activeTransfers} luồng đang chờ theo dõi`,
        description: "Theo dõi trạng thái giữa các điểm vận hành.",
        href: paths.transfers,
        icon: <IconArrowLeftRight className="size-4" />,
        severity: "info",
      });
    if (props.activeStocktakes > 0)
      items.push({
        key: "oversight-count",
        title: `${props.activeStocktakes} phiên đối soát tồn đang mở`,
        description: "Theo dõi tiến độ trước khi khóa chênh lệch.",
        href: paths.stocktake,
        icon: <IconClipboardList className="size-4" />,
        severity: "success",
      });
    if (expiryAlerts.length > 0)
      items.push({
        key: "oversight-exp",
        title: `${expiryAlerts.length} lô cần xử lý hạn dùng`,
        description: "Ưu tiên theo dõi các lô cận hạn.",
        href: paths.expiry,
        icon: <IconHourglass className="size-4" />,
        severity: "warning",
      });
    if (reorderAlerts.length > 0)
      items.push({
        key: "oversight-reorder",
        title: `${reorderAlerts.length} nguyên liệu chạm ngưỡng`,
        description: "Theo dõi điểm cần bổ sung hoặc điều chỉnh kế hoạch.",
        href: paths.stock,
        icon: <IconShoppingCart className="size-4" />,
        severity: "destructive",
      });
    return items.slice(0, 6);
  }

  if (siteKind === "branch") {
    if (inbound.length > 0)
      items.push({
        key: "recv",
        title: `${inbound.length} phiếu đến cần xác nhận`,
        description: "Nhận hàng nội bộ.",
        href: paths.transfers,
        icon: <IconTruck className="size-4" />,
        severity: "primary",
      });
    items.push({
      key: "issues",
      title: "Tiêu hao trong ngày",
      description: "Duyệt nguyên liệu đã dùng để ghi giá vốn thực tế.",
      href: paths.consumption,
      icon: <IconSquareCheck className="size-4" />,
      severity: "info",
    });
  }

  if (props.activeStocktakes > 0)
    items.push({
      key: "st",
      title: `${props.activeStocktakes} phiên kiểm kê đang mở`,
      description: "Hoàn tất để khóa chênh lệch.",
      href: paths.stocktake,
      icon: <IconClipboardList className="size-4" />,
      severity: "success",
    });
  if (expiryAlerts.length > 0)
    items.push({
      key: "exp",
      title: `${expiryAlerts.length} lô cần xử lý hạn dùng`,
      description: "Ưu tiên xuất các lô cận hạn.",
      href: paths.expiry,
      icon: <IconHourglass className="size-4" />,
      severity: "warning",
    });
  if (showProcurement && reorderAlerts.length > 0)
    items.push({
      key: "reorder",
      title: `${reorderAlerts.length} nguyên liệu chạm ngưỡng`,
      description: "Chuẩn bị PO.",
      href: paths.purchaseOrders,
      icon: <IconShoppingCart className="size-4" />,
      severity: "destructive",
    });
  if (showProcurement && props.priceReviewCount > 0)
    items.push({
      key: "price-review",
      title: `${props.priceReviewCount} dòng GRN cần kiểm tra giá`,
      description: "Giá nhập lệch lớn so với PO trong 30 ngày qua.",
      href: paths.grn,
      icon: <IconReceipt className="size-4" />,
      severity: "warning",
    });
  return items.slice(0, 6);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardClient(props: DashboardProps) {
  const {
    routeBase,
    siteName,
    showProcurement,
    totalStockValue,
    pendingPO,
    activeTransfers,
    reorderAlerts,
    expiryAlerts,
    transfers,
    stocktakeSessions,
  } = props;

  const isMobile = useIsMobile();
  const paths = getInventoryPaths(routeBase);
  const flowCards = buildFlowCards(props);
  const withBranch = (href: string) =>
    appendBranchId(href, props.selectedBranchId);
  const tasks = buildTasks(props);
  const isOversight = isInventoryOversightRole(props.userRole);

  const activeTransferList = transfers
    .filter((t) =>
      [
        "in_transit",
        "confirmed",
        "confirmed_ship",
        "confirmed_receive",
      ].includes(t.status),
    )
    .slice(0, isMobile ? 2 : 3);
  const activeStocktakeList = stocktakeSessions.filter(
    (s) => s.status === "in_progress",
  );

  const siteKindLabel = "Chi nhánh";
  const stockValueLabel = "Giá trị tồn kho:";

  return (
    <AppPage width={isMobile ? "narrow" : "wide"}>
      <AppPageHeader
        eyebrow={`Kho hàng · ${siteKindLabel}`}
        title={siteName}
        description={
          isOversight
            ? "Giám sát tồn, cảnh báo và luồng đang chạy."
            : messages.inventory.dashboard.headerTagline
        }
        meta={
          <span className="inline-flex items-center gap-2">
            <span className="text-muted-foreground">{stockValueLabel}</span>
            <span className="font-mono text-base font-semibold tabular-nums text-foreground">
              {formatVND(totalStockValue)}
            </span>
          </span>
        }
      />
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold">
          {isOversight
            ? "3 điểm giám sát chính"
            : messages.inventory.dashboard.mainFlowsTitle}
        </h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {flowCards.map((flow) => {
            const Icon = flow.icon;

            return (
              <div
                key={flow.key}
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-card",
                  flow.tone === "destructive" && "bg-destructive/5",
                  flow.tone === "warning" && "bg-warning/10",
                  flow.tone === "info" && "bg-info/10",
                  flow.tone === "success" && "bg-success/10",
                )}
              >
                <div className="flex flex-col gap-3 p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-heading text-base font-semibold leading-tight">
                          {flow.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {flow.description}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "font-heading shrink-0 font-mono text-2xl font-bold tabular-nums",
                        flow.metric === "0"
                          ? "text-muted-foreground"
                          : "text-primary",
                      )}
                    >
                      {flow.metric}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {flow.metricLabel}
                      </p>
                      <p className="text-sm font-medium">{flow.statusLabel}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link
                        href={withBranch(flow.href)}
                        aria-label={flow.title}
                      >
                        <IconArrowRight />
                      </Link>
                    </Button>
                  </div>
                </div>
                <div className="p-4 pt-0">
                  <div className="flex flex-wrap gap-2">
                    {flow.actions.map((action) => (
                      <Button
                        key={`${flow.key}-${action.label}`}
                        variant={action.primary ? "default" : "outline"}
                        size="sm"
                        asChild
                      >
                        <Link href={withBranch(action.href)}>
                          {action.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* KPI cards — "Giá trị tồn kho" lives in header meta to avoid duplication. */}
      <div
        className={cn(
          "grid gap-3",
          isMobile
            ? "grid-cols-2"
            : showProcurement
              ? "sm:grid-cols-2 lg:grid-cols-4"
              : "sm:grid-cols-3",
        )}
      >
        {[
          {
            label: isOversight ? "Hồ sơ nhập đang chờ" : "PO đang chờ",
            value: String(pendingPO),
            tone: "default" as const,
          },
          {
            label: isOversight ? "Luồng đang xử lý" : "Transfer đang xử lý",
            value: String(activeTransfers),
            tone: "default" as const,
          },
          {
            label: "Cảnh báo hết hạn",
            value: String(expiryAlerts.length),
            tone:
              expiryAlerts.length > 0
                ? ("warning" as const)
                : ("default" as const),
          },
          ...(showProcurement
            ? [
                {
                  label: "GRN cần kiểm tra giá (30d)",
                  value: String(props.priceReviewCount),
                  tone:
                    props.priceReviewCount > 0
                      ? ("destructive" as const)
                      : ("default" as const),
                },
              ]
            : []),
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={cn(
              "rounded-lg border bg-card",
              kpi.tone === "destructive" &&
                "border-destructive/40 bg-destructive/5",
              kpi.tone === "warning" && "border-warning/40 bg-warning/10",
            )}
          >
            <div className="p-4">
              <p className={cn("text-muted-foreground text-xs")}>{kpi.label}</p>
              <p
                className={cn(
                  "font-bold tabular-nums",
                  isMobile ? "mt-1 text-lg" : "mt-1 text-2xl",
                  kpi.tone === "destructive" && "text-destructive",
                  kpi.tone === "warning" && "text-warning",
                )}
              >
                {kpi.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* All-clear hero replaces the four panels when nothing pending. */}
      {tasks.length === 0 &&
      reorderAlerts.length === 0 &&
      expiryAlerts.length === 0 &&
      activeTransferList.length === 0 &&
      activeStocktakeList.length === 0 ? (
        <AppSection contentClassName="items-center gap-3 py-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
            <IconSquareCheck className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-heading text-base font-semibold">
              {messages.inventory.dashboard.allClearTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {isOversight
                ? "Không có cảnh báo hoặc luồng đang chờ theo dõi."
                : messages.inventory.dashboard.allClearHint}
            </p>
          </div>
        </AppSection>
      ) : (
        <>
          {/* Tasks + Alerts */}
          <div
            className={cn(
              "grid gap-4",
              isMobile ? "grid-cols-1" : "lg:grid-cols-2",
            )}
          >
            {/* Tasks */}
            <AppSection
              title={messages.inventory.dashboard.shiftTasksTitle}
              description={messages.inventory.dashboard.pendingTasks(tasks.length)}
              size="sm"
              badge={{
                variant: "secondary",
                children: (
                  <>
                    <IconClock className="mr-1 size-3" />
                    {siteKindLabel}
                  </>
                ),
              }}
            >
              {tasks.length === 0 ? (
                <AppEmptyState
                  compact
                  icon={<IconSquareCheck />}
                  title={messages.inventory.dashboard.noUrgentTasks}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {tasks.map((task) => {
                    const badge = taskBadge[task.severity];
                    return (
                      <AppLinkCard
                        key={task.key}
                        href={withBranch(task.href)}
                        title={task.title}
                        description={task.description}
                        icon={task.icon}
                        tone={taskLinkTone[task.severity]}
                        badge={badge.label}
                        badgeVariant={badge.variant}
                        ctaLabel="Mở xử lý"
                      />
                    );
                  })}
                </div>
                )}
            </AppSection>

            {/* Alerts */}
            <AppSection
              title={messages.inventory.dashboard.priorityAlertsTitle}
              size="sm"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link href={withBranch(paths.expiry)}>
                    {ACTIONS_VI.viewAll}
                  </Link>
                </Button>
              }
            >
                <div className="flex flex-col gap-2">
                  {reorderAlerts.slice(0, isMobile ? 2 : 3).map((item) => (
                    <AppLinkCard
                      key={`r-${item.ingredientId}-${item.branchId}`}
                      href={withBranch(
                        showProcurement ? paths.purchaseOrders : paths.stock,
                      )}
                      title={item.name}
                      description={messages.inventory.dashboard.reorderStatus(
                        item.current,
                        item.unit,
                        item.reorder,
                      )}
                      icon={<IconAlertTriangle />}
                      tone="warning"
                      badge={messages.inventory.dashboard.reorder}
                      badgeVariant="destructive"
                      ctaLabel="Mở xử lý"
                    />
                  ))}
                  {expiryAlerts.slice(0, isMobile ? 2 : 3).map((item) => (
                    <AppLinkCard
                      key={`e-${item.id}`}
                      href={withBranch(paths.expiry)}
                      title={
                        item.lot
                          ? `${item.ingredientName} • ${item.lot}`
                          : item.ingredientName
                      }
                      description={
                        item.daysLeft <= 0
                          ? messages.inventory.dashboard.expiredDays(
                              item.daysLeft,
                            )
                          : messages.inventory.dashboard.remainingDays(
                              item.daysLeft,
                            )
                      }
                      icon={<IconAlertTriangle />}
                      tone="warning"
                      badge={
                        item.daysLeft <= 0
                          ? tStatus("expired", "badge")
                          : tStatus("critical", "badge")
                      }
                      badgeVariant={
                        item.urgency === "critical" ? "destructive" : "warning"
                      }
                      ctaLabel="Mở hạn dùng"
                    />
                  ))}
                  {reorderAlerts.length === 0 && expiryAlerts.length === 0 && (
                    <AppEmptyState
                      compact
                      icon={<IconSquareCheck />}
                      title={messages.inventory.dashboard.noAlerts}
                    />
                  )}
                </div>
            </AppSection>
          </div>

          {/* Transfer tracking + Stocktake progress */}
          <div
            className={cn(
              "grid gap-4",
              isMobile ? "grid-cols-1" : "lg:grid-cols-2",
            )}
          >
            <AppSection
              title={
                isOversight
                  ? "Luồng đang xử lý"
                  : messages.inventory.dashboard.transferTrackingTitle
              }
              description={messages.inventory.dashboard.activeTransfers(
                activeTransferList.length,
              )}
              size="sm"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link href={withBranch(paths.transfers)}>
                    {ACTIONS_VI.viewAll}
                  </Link>
                </Button>
              }
            >
                {activeTransferList.length === 0 ? (
                  <AppEmptyState
                    compact
                    icon={<IconArrowLeftRight />}
                    title={messages.inventory.dashboard.noActiveTransfers}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {activeTransferList.map((t) => (
                      <AppLinkCard
                        key={t.id}
                        href={withBranch(paths.transferDetail(t.id))}
                        title={t.code}
                        description={`${t.fromBranch} -> ${t.toBranch}`}
                        icon={<IconArrowLeftRight />}
                        tone="info"
                        badge={tStatus(t.status, "badge")}
                        badgeVariant="info"
                        ctaLabel="Mở phiếu"
                      />
                    ))}
                  </div>
                )}
            </AppSection>

            <AppSection
              title={
                isOversight
                  ? "Tiến độ đối soát tồn"
                  : messages.inventory.dashboard.stocktakeProgress
              }
              description={
                isOversight
                  ? `${activeStocktakeList.length} phiên đang thực hiện`
                  : messages.inventory.dashboard.activeStocktakes(
                      activeStocktakeList.length,
                    )
              }
              size="sm"
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link href={withBranch(paths.stocktake)}>
                    {ACTIONS_VI.viewAll}
                  </Link>
                </Button>
              }
            >
                {activeStocktakeList.length === 0 ? (
                  <AppEmptyState
                    compact
                    icon={<IconClipboardList />}
                    title={
                      isOversight
                        ? "Không có phiên đối soát tồn đang thực hiện"
                        : messages.inventory.dashboard.noActiveStocktakes
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {activeStocktakeList.map((s) => (
                      <AppLinkCard
                        key={s.id}
                        href={withBranch(paths.stocktakeDetail(s.id))}
                        title={s.code}
                        description={s.branchName}
                        icon={<IconClipboardList />}
                        tone="success"
                        badge={tStatus(s.status, "badge")}
                        badgeVariant="success"
                        metric={{ value: `${s.progress}%`, label: "tiến độ" }}
                        ctaLabel="Mở phiên"
                      />
                    ))}
                  </div>
                )}
            </AppSection>
          </div>
        </>
      )}
    </AppPage>
  );
}
