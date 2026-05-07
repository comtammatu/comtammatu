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
  Factory as IconBuildingFactory,
  Hourglass as IconHourglass,
  Lightbulb as IconBulb,
  Receipt as IconReceipt,
  ShoppingCart as IconShoppingCart,
  Truck as IconTruck,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Progress } from "@comtammatu/ui/components/progress";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { StatusBadge } from "./_components/status-badge";
import { formatVND } from "./_lib/format";
import { getInventoryPaths, type InventoryRouteBase } from "./_lib/paths";
import { tNav, tStatus } from "./_lib/dictionary";
import { messages } from "@lib/messages";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

import { ACTIONS_VI } from "@comtammatu/shared/messages";
type DashboardSiteKind = "central_warehouse" | "central_kitchen" | "branch";

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
          ? "Nhận hàng & cấp bếp"
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
      label: "Cấp bếp",
      href: `${paths.transfers}?create=cap-bep`,
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
        props.siteKind === "central_kitchen"
          ? "Nhận nguyên liệu, chạy lệnh sản xuất, rồi xuất thành phẩm về chi nhánh."
          : props.siteKind === "branch"
            ? "Nhận hàng về kho chi nhánh và cấp phát xuống bếp chi nhánh theo ca bán."
            : "Xuất hàng từ kho tổng sang bếp trung tâm hoặc kho chi nhánh.",
      href: paths.transfers,
      icon:
        props.siteKind === "central_kitchen"
          ? IconBuildingFactory
          : IconArrowLeftRight,
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

function buildTasks(props: DashboardProps): TaskItem[] {
  const {
    siteKind,
    siteName,
    showProcurement,
    pendingPO,
    activeTransfers,
    reorderAlerts,
    expiryAlerts,
    transfers,
  } = props;
  const paths = getInventoryPaths(props.routeBase);
  const items: TaskItem[] = [];
  const open = transfers.filter((t) => isTransferOpen(t.status));
  const inbound = open.filter((t) => t.toBranch === siteName);
  const outbound = open.filter((t) => t.fromBranch === siteName);

  if (siteKind === "central_warehouse") {
    if (pendingPO > 0)
      items.push({
        key: "po",
        title: `${pendingPO} PO cần theo dõi`,
        description: "Đẩy nhanh đơn mở trước GRN.",
        href: paths.purchaseOrders,
        icon: <IconShoppingCart className="size-4" />,
        severity: "primary",
      });
    if (outbound.length > 0 || activeTransfers > 0)
      items.push({
        key: "tf-out",
        title: `${outbound.length || activeTransfers} phiếu xuất đang mở`,
        description: "Theo dõi phiếu rời kho HQ.",
        href: paths.transfers,
        icon: <IconTruck className="size-4" />,
        severity: "info",
      });
  }

  if (siteKind === "central_kitchen") {
    items.push({
      key: "ck",
      title: "Chốt nhịp sản xuất",
      description: "Tạo/xác nhận lệnh sản xuất.",
      href: paths.production,
      icon: <IconBulb className="size-4" />,
      severity: "primary",
    });
    if (inbound.length > 0 || outbound.length > 0)
      items.push({
        key: "ck-tf",
        title: `${inbound.length || outbound.length} phiếu cần theo dõi`,
        description: "Nhận NL hoặc xuất TP.",
        href: paths.transfers,
        icon: <IconTruck className="size-4" />,
        severity: "info",
      });
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
      title: "Cấp bếp cho ca bán",
      description: "Chuyển từ kho chi nhánh sang bếp chi nhánh trước giờ bán.",
      href: `${paths.transfers}?create=cap-bep`,
      icon: <IconSquareCheck className="size-4" />,
      severity: "info",
    });
  }

  if (props.activeStocktakes > 0)
    items.push({
      key: "st",
      title: `${props.activeStocktakes} phiên kiểm kê đang mở`,
      description: "Hòan tất để khóa chênh lệch.",
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

const severityDot: Record<string, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
  primary: "bg-primary",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardClient(props: DashboardProps) {
  const {
    routeBase,
    siteKind,
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

  const activeTransferList = transfers
    .filter((t) =>
      [
        "in_transit",
        "confirmed",
        "confirmed_ship",
        "confirmed_receive",
      ].includes(t.status),
    )
    .slice(isMobile ? 2 : 3);
  const activeStocktakeList = stocktakeSessions.filter(
    (s) => s.status === "in_progress",
  );

  const siteKindLabel =
    siteKind === "central_warehouse"
      ? "HQ"
      : siteKind === "central_kitchen"
        ? "Bếp TT"
        : "Chi nhánh";

  return (
    <AppPage width={isMobile ? "narrow" : "wide"} contentClassName="gap-6">
      <AppPageHeader
        eyebrow={`Kho hàng · ${siteKindLabel}`}
        title={siteName}
        description="Tổng quan vận hành kho theo 3 luồng: kiểm soát tồn, nhập–nhận hàng, điều phối–sản xuất."
        meta={
          <span className="inline-flex items-center gap-2">
            <span className="text-muted-foreground">Giá trị tồn kho:</span>
            <span className="font-mono text-base font-semibold tabular-nums text-foreground">
              {formatVND(totalStockValue)}đ
            </span>
          </span>
        }
      />
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold">
            {messages.inventory.dashboard.mainFlowsTitle}
          </h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {flowCards.map((flow) => {
              const Icon = flow.icon;

              return (
                <Card
                  key={flow.key}
                  className={cn(
                    "relative overflow-hidden border-l-4",
                    flow.tone === "destructive" &&
                      "border-l-destructive bg-destructive/5",
                    flow.tone === "warning" &&
                      "border-l-warning bg-warning/10",
                    flow.tone === "info" && "border-l-info bg-info/10",
                    flow.tone === "success" && "border-l-success bg-success/10",
                    flow.tone === "default" && "border-l-primary/60",
                  )}
                >
                  <CardHeader className="gap-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base leading-tight">
                            {flow.title}
                          </CardTitle>
                          <CardDescription className="mt-1 line-clamp-2">
                            {flow.description}
                          </CardDescription>
                        </div>
                      </div>
                      <span className="font-heading shrink-0 font-mono text-2xl font-bold tabular-nums text-foreground">
                        {flow.metric}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {flow.metricLabel}
                        </p>
                        <p className="text-sm font-medium">
                          {flow.statusLabel}
                        </p>
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
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* KPI cards */}
        <div
          className={cn(
            "grid gap-3",
            isMobile ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {[
            {
              label: "Giá trị tồn kho",
              value: `${formatVND(totalStockValue)}đ`,
              tone: "default" as const,
            },
            {
              label: "PO đang chờ",
              value: String(pendingPO),
              tone: "default" as const,
            },
            {
              label: "Transfer đang xử lý",
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
            <Card
              key={kpi.label}
              className={cn(
                kpi.tone === "destructive" &&
                  "border-destructive/40 bg-destructive/5",
                kpi.tone === "warning" && "border-warning/40 bg-warning/10",
              )}
            >
              <CardContent className="p-4">
                <p className={cn("text-muted-foreground text-xs")}>
                  {kpi.label}
                </p>
                <p
                  className={cn(
                    "font-bold tabular-nums",
                    isMobile ? "mt-0.5 text-lg" : "mt-1 text-2xl",
                    kpi.tone === "destructive" && "text-destructive",
                    kpi.tone === "warning" && "text-warning",
                  )}
                >
                  {kpi.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tasks + Alerts */}
        <div
          className={cn(
            "grid gap-4",
            isMobile ? "grid-cols-1" : "lg:grid-cols-2",
          )}
        >
          {/* Tasks */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    {messages.inventory.dashboard.shiftTasksTitle}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {messages.inventory.dashboard.pendingTasks(tasks.length)}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="h-6">
                  <IconClock className="mr-1 size-3" />
                  {siteKindLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <AppEmptyState
                  compact
                  icon={<IconSquareCheck />}
                  title={messages.inventory.dashboard.noUrgentTasks}
                />
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <Link
                      key={task.key}
                      href={withBranch(task.href)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent active:scale-[0.99]",
                        isMobile && "min-h-14",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          severityDot[task.severity],
                        )}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium leading-tight">
                          {task.title}
                        </p>
                        <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      </div>
                      <IconArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alerts */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    {messages.inventory.dashboard.priorityAlertsTitle}
                  </CardTitle>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={withBranch(paths.expiry)}>
                    {ACTIONS_VI.viewAll}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {reorderAlerts.slice(0, isMobile ? 2 : 3).map((item) => (
                  <Link
                    key={`r-${item.ingredientId}-${item.branchId}`}
                    href={withBranch(
                      showProcurement ? paths.purchaseOrders : paths.stock,
                    )}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3 transition-colors hover:bg-accent",
                      isMobile && "min-h-14",
                    )}
                  >
                    <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium leading-tight">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {messages.inventory.dashboard.reorderStatus(
                          item.current,
                          item.unit,
                          item.reorder,
                        )}
                      </p>
                    </div>
                    <Badge variant="destructive" className="shrink-0 text-xs">
                      {messages.inventory.dashboard.reorder}
                    </Badge>
                  </Link>
                ))}
                {expiryAlerts.slice(0, isMobile ? 2 : 3).map((item) => (
                  <Link
                    key={`e-${item.id}`}
                    href={withBranch(paths.expiry)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent",
                      item.urgency === "critical"
                        ? "border-destructive/50 bg-destructive/5"
                        : "border-warning/50 bg-warning/5",
                      isMobile && "min-h-14",
                    )}
                  >
                    <IconAlertTriangle
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        item.urgency === "critical"
                          ? "text-destructive"
                          : "text-warning",
                      )}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium leading-tight">
                        {item.ingredientName}
                        {item.lot ? ` • ${item.lot}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.daysLeft <= 0
                          ? messages.inventory.dashboard.expiredDays(
                              item.daysLeft,
                            )
                          : messages.inventory.dashboard.remainingDays(
                              item.daysLeft,
                            )}
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.urgency === "critical" ? "destructive" : "warning"
                      }
                      className="shrink-0 text-xs"
                    >
                      {item.daysLeft <= 0
                        ? tStatus("expired", "badge")
                        : tStatus("critical", "badge")}
                    </Badge>
                  </Link>
                ))}
                {reorderAlerts.length === 0 && expiryAlerts.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {messages.inventory.dashboard.noAlerts}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transfer tracking + Stocktake progress */}
        <div
          className={cn(
            "grid gap-4",
            isMobile ? "grid-cols-1" : "lg:grid-cols-2",
          )}
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    {messages.inventory.dashboard.transferTrackingTitle}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {messages.inventory.dashboard.activeTransfers(
                      activeTransferList.length,
                    )}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={withBranch(paths.transfers)}>
                    {ACTIONS_VI.viewAll}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeTransferList.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {messages.inventory.dashboard.noActiveTransfers}
                </p>
              ) : (
                <div className="space-y-2">
                  {activeTransferList.map((t) => (
                    <Link
                      key={t.id}
                      href={withBranch(paths.transferDetail(t.id))}
                      className={cn(
                        "block rounded-lg border p-3 transition-colors hover:bg-accent active:scale-[0.99]",
                        isMobile && "min-h-14",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{t.code}</span>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{t.fromBranch}</span>
                        <IconArrowRight className="size-3" />
                        <span>{t.toBranch}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    {messages.inventory.dashboard.stocktakeProgress}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {messages.inventory.dashboard.activeStocktakes(
                      activeStocktakeList.length,
                    )}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={withBranch(paths.stocktake)}>
                    {ACTIONS_VI.viewAll}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeStocktakeList.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {messages.inventory.dashboard.noActiveStocktakes}
                </p>
              ) : (
                <div className="space-y-2">
                  {activeStocktakeList.map((s) => (
                    <Link
                      key={s.id}
                      href={withBranch(paths.stocktakeDetail(s.id))}
                      className={cn(
                        "block rounded-lg border p-3 transition-colors hover:bg-accent active:scale-[0.99]",
                        isMobile && "min-h-14",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{s.code}</span>
                        <Badge variant="secondary" className="text-xs">
                          {s.progress}%
                        </Badge>
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {s.branchName}
                      </p>
                      <Progress value={s.progress} className="h-2" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </AppPage>
  );
}
