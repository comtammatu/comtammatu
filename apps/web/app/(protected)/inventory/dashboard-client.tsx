"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  TriangleAlert as IconAlertTriangle,
  ArrowLeftRight as IconArrowLeftRight,
  ClipboardCheck as IconClipboardCheck,
  SquareCheck as IconSquareCheck,
  ClipboardList as IconClipboardList,
  Clock as IconClock,
  Factory as IconBuildingFactory,
  Receipt as IconReceipt,
  Settings as IconSettings,
  ShoppingCart as IconShoppingCart,
  Truck as IconTruck,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { formatVNTime, formatVNDate } from "@comtammatu/shared/time";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { KpiCard } from "@/components/kpi/kpi-card";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
  LinkCardGrid,
  type AppLinkCardProps,
} from "@/components/surface";
import { formatVND } from "./_lib/format";
import { getInventoryPaths, type InventoryRouteBase } from "./_lib/paths";
import { tNav, tStatus } from "./_lib/dictionary";
import { messages } from "@lib/messages";
import type { DashboardWarning } from "./_lib/dashboard-data";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
type DashboardSiteKind = "branch" | "central_supply" | "central_kitchen";

export type DashboardProps = {
  routeBase: InventoryRouteBase;
  siteName: string;
  siteKind: DashboardSiteKind;
  userRole: StaffRole;
  showProcurement: boolean;
  showProduction: boolean;
  canAssignCounts: boolean;
  canApproveCounts: boolean;
  selectedBranchId: number | null;
  canViewStockValue: boolean;
  totalStockValue: number | null;
  dashboardWarnings: DashboardWarning[];
  pendingPO: number;
  activeTransfers: number;
  activeStocktakes: number;
  pendingCountSlips: number;
  priceReviewCount: number;
  reorderAlerts: Array<{
    ingredientId: number;
    branchId: number;
    name: string;
    current: number;
    reorder: number;
    unit: string;
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
  dataAsOf?: string;
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
    props.reorderAlerts.length +
    props.priceReviewCount;

  if (
    isInventoryOversightRole(props.userRole) &&
    !props.showProcurement &&
    !props.showProduction
  ) {
    return [
      {
        key: "oversight-stock",
        title: messages.inventory.dashboard.oversightStockTitle,
        description: messages.inventory.dashboard.oversightStockDescription,
        href: paths.stock,
        icon: IconClipboardList,
        metric: String(exceptionCount),
        metricLabel: messages.inventory.dashboard.oversightStockMetricLabel,
        statusLabel: messages.inventory.dashboard.lowStockStatus(
          props.reorderAlerts.length,
        ),
        tone: props.reorderAlerts.length > 0 ? "warning" : "default",
        actions: [
          {
            label: messages.inventory.dashboard.viewStockAction,
            href: paths.stock,
            primary: true,
          },
          { label: tNav("reports", "navigation"), href: paths.reports },
        ],
      },
      {
        key: "oversight-alerts",
        title: messages.inventory.dashboard.oversightAlertsTitle,
        description: messages.inventory.dashboard.oversightAlertsDescription,
        href: paths.stock,
        icon: IconAlertTriangle,
        metric: String(props.reorderAlerts.length),
        metricLabel: messages.inventory.dashboard.alertsMetricLabel,
        statusLabel: messages.inventory.dashboard.lowStockStatus(
          props.reorderAlerts.length,
        ),
        tone: props.reorderAlerts.length > 0 ? "warning" : "default",
        actions: [
          {
            label: messages.inventory.dashboard.viewAlertsAction,
            href: paths.stock,
            primary: true,
          },
          { label: tNav("reports", "navigation"), href: paths.reports },
        ],
      },
      {
        key: "oversight-movement",
        title: messages.inventory.dashboard.oversightMovementTitle,
        description: messages.inventory.dashboard.oversightMovementDescription,
        href: paths.transfers,
        icon: IconArrowLeftRight,
        metric: String(props.activeTransfers),
        metricLabel: messages.inventory.dashboard.runningSlipsMetricLabel,
        statusLabel: messages.inventory.dashboard.inboundOutboundStatus(
          inbound.length,
          outbound.length,
        ),
        tone: props.activeTransfers > 0 ? "info" : "default",
        actions: [
          {
            label: messages.inventory.dashboard.trackAction,
            href: paths.transfers,
            primary: true,
          },
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
        {
          label: messages.inventory.dashboard.inboundSlipsAction,
          href: paths.transfers,
          primary: true,
        },
        { label: tNav("stock", "navigation"), href: paths.stock },
      ];

  const countActions: FlowAction[] = [
    ...(props.canAssignCounts
      ? [
          {
            label: messages.inventory.dashboard.assignCountsAction,
            href: paths.countAssignments,
          },
        ]
      : []),
    ...(props.canApproveCounts
      ? [
          {
            label: messages.inventory.dashboard.approveCountSlipsAction,
            href: paths.countSlips,
          },
        ]
      : []),
  ];

  const movementActions: FlowAction[] = [
    {
      label:
        props.siteKind === "branch"
          ? messages.inventory.dashboard.receiveTransferAction
          : tNav("transfers", "navigation"),
      href: paths.transfers,
      primary: !props.showProduction,
    },
  ];

  if (props.showProduction) {
    movementActions.push({
      label: messages.inventory.dashboard.productionCommandAction,
      href: paths.production,
      primary: true,
    });
  }

  if (props.siteKind === "branch") {
    movementActions.push({
      label: messages.inventory.dashboard.consumptionAction,
      href: paths.consumption,
    });
  }

  return [
    {
      key: "control",
      title: messages.inventory.dashboard.controlFlowTitle,
      description: messages.inventory.dashboard.controlDescription,
      href: paths.stocktake,
      icon: IconClipboardList,
      metric: String(exceptionCount),
      metricLabel: messages.inventory.dashboard.controlMetricLabel,
      statusLabel: messages.inventory.dashboard.stocktakeStatus(
        props.activeStocktakes,
      ),
      tone:
        props.reorderAlerts.length > 0
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
        ...countActions,
        { label: tNav("issues", "navigation"), href: paths.issues },
        { label: tNav("reports", "navigation"), href: paths.reports },
      ],
    },
    {
      key: "source",
      title: messages.inventory.dashboard.sourceFlowTitle,
      description: props.showProcurement
        ? INVENTORY_VI.dashboardSourceProcurementDescription
        : messages.inventory.dashboard.sourceBranchDescription,
      href: props.showProcurement ? paths.purchaseOrders : paths.transfers,
      icon: props.showProcurement ? IconShoppingCart : IconTruck,
      metric: String(props.showProcurement ? props.pendingPO : inbound.length),
      metricLabel: props.showProcurement
        ? INVENTORY_VI.dashboardPendingPoLabel
        : messages.inventory.dashboard.inboundSlipsMetricLabel,
      statusLabel: props.showProcurement
        ? messages.inventory.dashboard.priceReviewLinesStatus(
            props.priceReviewCount,
          )
        : messages.inventory.dashboard.inboundNeedReceiveStatus(
            inbound.length,
          ),
      tone:
        (props.showProcurement && props.pendingPO > 0) || inbound.length > 0
          ? "info"
          : "default",
      actions: sourceActions,
    },
    {
      key: "production",
      title: messages.inventory.dashboard.productionFlowTitle,
      description: messages.inventory.dashboard.productionFlowDescription,
      href: props.showProduction ? paths.production : paths.transfers,
      icon: props.showProduction ? IconBuildingFactory : IconArrowLeftRight,
      metric: String(props.activeTransfers),
      metricLabel: messages.inventory.dashboard.runningSlipsMetricLabel,
      statusLabel: messages.inventory.dashboard.inboundOutboundStatus(
        inbound.length,
        outbound.length,
      ),
      tone: props.activeTransfers > 0 ? "info" : "default",
      actions: movementActions,
    },
    {
      key: "catalog",
      title: messages.inventory.dashboard.catalogFlowTitle,
      description: messages.inventory.dashboard.catalogDescription,
      href: paths.ingredients,
      icon: IconSettings,
      metric: messages.inventory.dashboard.catalogMetricValue,
      metricLabel: messages.inventory.dashboard.catalogMetricLabel,
      statusLabel: messages.inventory.dashboard.catalogStatusLabel,
      tone: "default",
      actions: [
        {
          label: tNav("ingredients", "navigation"),
          href: paths.ingredients,
          primary: true,
        },
        {
          label: messages.inventory.dashboard.unitsAction,
          href: paths.units,
        },
        { label: tNav("suppliers", "navigation"), href: paths.suppliers },
        { label: tNav("recipes", "navigation"), href: paths.recipes },
      ],
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
  destructive: {
    label: messages.inventory.dashboard.taskBadgePriority,
    variant: "destructive",
  },
  warning: {
    label: messages.inventory.dashboard.taskBadgePending,
    variant: "warning",
  },
  info: {
    label: messages.inventory.dashboard.taskBadgeWatch,
    variant: "info",
  },
  success: {
    label: messages.inventory.dashboard.taskBadgeOpen,
    variant: "success",
  },
  primary: {
    label: messages.inventory.dashboard.taskBadgeContinue,
    variant: "default",
  },
};

const flowTone: Record<
  FlowCard["tone"],
  NonNullable<AppLinkCardProps["tone"]>
> = {
  default: "secondary",
  destructive: "warning",
  warning: "warning",
  info: "info",
  success: "success",
};

const flowBadgeVariant: Record<
  FlowCard["tone"],
  NonNullable<AppLinkCardProps["badgeVariant"]>
> = {
  default: "secondary",
  destructive: "destructive",
  warning: "warning",
  info: "info",
  success: "success",
};

function buildTasks(props: DashboardProps): TaskItem[] {
  const {
    siteKind,
    siteName,
    showProcurement,
    activeTransfers,
    pendingCountSlips,
    reorderAlerts,
    transfers,
  } = props;
  const paths = getInventoryPaths(props.routeBase);
  const items: TaskItem[] = [];
  const open = transfers.filter((t) => isTransferOpen(t.status));
  const inbound = open.filter((t) => t.toBranch === siteName);
  const isOversight =
    isInventoryOversightRole(props.userRole) &&
    !props.showProcurement &&
    !props.showProduction;

  if (isOversight) {
    if (activeTransfers > 0)
      items.push({
        key: "oversight-flow",
        title: messages.inventory.dashboard.flowsAwaitingWatch(activeTransfers),
        description: messages.inventory.dashboard.watchBetweenSites,
        href: paths.transfers,
        icon: <IconArrowLeftRight className="size-4" />,
        severity: "info",
      });
    if (props.activeStocktakes > 0)
      items.push({
        key: "oversight-count",
        title: messages.inventory.dashboard.reconcileSessionsOpen(
          props.activeStocktakes,
        ),
        description: messages.inventory.dashboard.watchProgressBeforeLock,
        href: paths.stocktake,
        icon: <IconClipboardList className="size-4" />,
        severity: "success",
      });
    if (reorderAlerts.length > 0)
      items.push({
        key: "oversight-reorder",
        title: messages.inventory.dashboard.reorderThresholdTask(
          reorderAlerts.length,
        ),
        description: messages.inventory.dashboard.watchReplenishPoints,
        href: paths.stock,
        icon: <IconShoppingCart className="size-4" />,
        severity: "destructive",
      });
    return items.slice(0, 6);
  }

  if (siteKind === "branch") {
    if (pendingCountSlips > 0)
      items.push({
        key: "count-slips",
        title: messages.inventory.dashboard.countSlipsPendingTask(
          pendingCountSlips,
        ),
        description: messages.inventory.dashboard.countSlipsReviewHint,
        href: paths.countSlips,
        icon: <IconClipboardCheck className="size-4" />,
        severity: "primary",
      });
    if (inbound.length > 0)
      items.push({
        key: "recv",
        title: messages.inventory.dashboard.inboundConfirmTask(inbound.length),
        description: messages.inventory.dashboard.inboundReceiveHint,
        href: paths.transfers,
        icon: <IconTruck className="size-4" />,
        severity: "primary",
      });
    items.push({
      key: "issues",
      title: messages.inventory.dashboard.dailyConsumptionTask,
      description: messages.inventory.dashboard.dailyConsumptionHint,
      href: paths.consumption,
      icon: <IconSquareCheck className="size-4" />,
      severity: "info",
    });
  }

  if (props.activeStocktakes > 0)
    items.push({
      key: "st",
      title: messages.inventory.dashboard.stocktakeOpenTask(
        props.activeStocktakes,
      ),
      description: messages.inventory.dashboard.stocktakeFinishHint,
      href: paths.stocktake,
      icon: <IconClipboardList className="size-4" />,
      severity: "success",
    });
  if (showProcurement && reorderAlerts.length > 0)
    items.push({
      key: "reorder",
      title: messages.inventory.dashboard.reorderThresholdTask(
        reorderAlerts.length,
      ),
      description: INVENTORY_VI.dashboardPreparePoHint,
      href: paths.purchaseOrders,
      icon: <IconShoppingCart className="size-4" />,
      severity: "destructive",
    });
  if (showProcurement && props.priceReviewCount > 0)
    items.push({
      key: "price-review",
      title: INVENTORY_VI.dashboardGrnPriceReviewTask(props.priceReviewCount),
      description: INVENTORY_VI.dashboardGrnPriceVarianceHint,
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
    showProduction,
    canViewStockValue,
    totalStockValue,
    dashboardWarnings,
    pendingPO,
    activeTransfers,
    reorderAlerts,
    transfers,
    stocktakeSessions,
    dataAsOf,
  } = props;

  const paths = getInventoryPaths(routeBase);
  const flowCards = buildFlowCards(props);
  const withBranch = (href: string) =>
    appendBranchId(href, props.selectedBranchId);
  const tasks = buildTasks(props);
  const isOversight =
    isInventoryOversightRole(props.userRole) && !showProcurement && !showProduction;

  const openTransfers = transfers.filter((t) => isTransferOpen(t.status));
  const inboundTransferCount = openTransfers.filter(
    (t) => t.toBranch === siteName,
  ).length;
  const outboundTransferCount = openTransfers.filter(
    (t) => t.fromBranch === siteName,
  ).length;
  const activeTransferList = transfers
    .filter((t) => isTransferOpen(t.status))
    .slice(0, 3);
  const activeStocktakeList = stocktakeSessions.filter(
    (s) => s.status === "in_progress",
  );
  const hasOpenInventoryWork =
    tasks.length > 0 ||
    reorderAlerts.length > 0 ||
    activeTransferList.length > 0 ||
    activeStocktakeList.length > 0;

  const siteKindLabel = getInventorySiteKindLabelVi(props.siteKind);
  const stockValueLabel = messages.inventory.value.inventoryValue;
  const stockValueDegraded = dashboardWarnings.includes("stockValue");
  const stockValueText = stockValueDegraded
    ? messages.inventory.dashboard.stockValueUnavailable
    : totalStockValue == null
      ? messages.inventory.dashboard.stockValueMasked
      : formatVND(totalStockValue);
  const stockValueHint = stockValueDegraded
    ? messages.inventory.dashboard.stockValueUnavailableHint
    : !canViewStockValue
      ? messages.inventory.dashboard.stockValueMaskedHint
      : null;
  const degradedItems = dashboardWarnings.map(
    (warning) => messages.inventory.dashboard.degradedItems[warning],
  );
  const dashboardKpis = [
    {
      label: showProcurement
        ? INVENTORY_VI.dashboardPendingPoLabel
        : isOversight
          ? messages.inventory.dashboard.kpiInboundDocsPending
          : messages.inventory.dashboard.kpiInboundSlipsPending,
      value: String(
        showProcurement || isOversight ? pendingPO : inboundTransferCount,
      ),
      hint: showProcurement
        ? messages.inventory.dashboard.kpiSourceHint
        : messages.inventory.dashboard.kpiMovementHint,
      tone: "neutral" as const,
      href: showProcurement ? paths.purchaseOrders : paths.transfers,
      icon: <IconShoppingCart className="size-4" />,
    },
    {
      label: messages.inventory.dashboard.activeFlowsTitle,
      value: String(activeTransfers),
      hint: messages.inventory.dashboard.inboundOutboundStatus(
        inboundTransferCount,
        outboundTransferCount,
      ),
      tone: activeTransfers > 0 ? ("primary" as const) : ("neutral" as const),
      href: paths.transfers,
      icon: <IconArrowLeftRight className="size-4" />,
    },
    ...(showProcurement
      ? [
          {
            label: INVENTORY_VI.dashboardGrnPriceReviewLabel,
            value: String(props.priceReviewCount),
            hint: messages.inventory.dashboard.kpiLast30Days,
            tone:
              props.priceReviewCount > 0
                ? ("destructive" as const)
                : ("neutral" as const),
            href: paths.grn,
            icon: <IconReceipt className="size-4" />,
          },
        ]
      : []),
  ];

  return (
    <AppPage width="full" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.dashboard.headerEyebrow(siteKindLabel)}
        title={siteName}
        description={
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
            <span>
              {isOversight
                ? messages.inventory.dashboard.oversightTagline
                : messages.inventory.dashboard.headerTagline}
            </span>
            {dataAsOf ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 font-mono">
                <IconClock className="size-3" />
                {messages.inventory.dashboard.dataAsOfLabel}:{" "}
                {formatVNTime(dataAsOf)} ({formatVNDate(dataAsOf).slice(0, 5)})
              </span>
            ) : null}
          </div>
        }
        meta={
	          <span className="inline-flex items-center gap-2">
	            <span className="text-muted-foreground">{stockValueLabel}</span>
	            <span
	              className="font-mono text-base font-semibold tabular-nums text-foreground"
	              title={stockValueHint ?? undefined}
	            >
	              {stockValueText}
	            </span>
	          </span>
	        }
	      />

	      {dashboardWarnings.length > 0 ? (
	        <NoteCallout
	          tone="warning"
	          icon={<IconAlertTriangle className="size-4" />}
	          label={messages.inventory.dashboard.dataDegradedTitle}
	        >
	          {messages.inventory.dashboard.dataDegradedDescription(
	            degradedItems.join(", "),
	          )}
	        </NoteCallout>
	      ) : null}

      {!hasOpenInventoryWork ? (
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
                ? messages.inventory.dashboard.oversightAllClearHint
                : messages.inventory.dashboard.allClearHint}
            </p>
          </div>
        </AppSection>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
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
                      ctaLabel={messages.inventory.dashboard.openActionCta}
                    />
                  );
                })}
              </div>
            )}
          </AppSection>

          <AppSection
            title={messages.inventory.dashboard.priorityAlertsTitle}
            size="sm"
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href={withBranch(showProcurement ? paths.purchaseOrders : paths.stock)}>
                  {ACTIONS_VI.viewAll}
                </Link>
              </Button>
            }
          >
            <div className="flex flex-col gap-2">
              {reorderAlerts.slice(0, 3).map((item) => (
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
                  ctaLabel={messages.inventory.dashboard.openActionCta}
                />
              ))}
              {reorderAlerts.length === 0 && (
                <AppEmptyState
                  compact
                  icon={<IconSquareCheck />}
                  title={messages.inventory.dashboard.noAlerts}
                />
              )}
            </div>
          </AppSection>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-semibold">
            {isOversight
              ? messages.inventory.dashboard.mainFlowsOversightTitle
              : messages.inventory.dashboard.mainFlowsTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {isOversight
              ? messages.inventory.dashboard.mainFlowsOversightDescription
              : messages.inventory.dashboard.mainFlowsOperatorDescription}
          </p>
        </div>
        <LinkCardGrid>
          {flowCards.map((flow) => {
            const Icon = flow.icon;
            const primaryAction =
              flow.actions.find((action) => action.primary) ?? flow.actions[0];
            const secondaryActions = flow.actions.filter(
              (action) => action.href !== primaryAction?.href,
            );

            return (
              <div key={flow.key} className="flex min-h-full flex-col gap-2">
                <AppLinkCard
                  href={withBranch(primaryAction?.href ?? flow.href)}
                  title={flow.title}
                  description={flow.description}
                  icon={<Icon />}
                  tone={flowTone[flow.tone]}
                  badge={flow.statusLabel}
                  badgeVariant={flowBadgeVariant[flow.tone]}
                  metric={{ value: flow.metric, label: flow.metricLabel }}
                  ctaLabel={
                    primaryAction?.label ??
                    messages.inventory.dashboard.openActionCta
                  }
                />
                {secondaryActions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {secondaryActions.map((action) => (
                      <Button
                        key={action.href}
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link href={withBranch(action.href)}>{action.label}</Link>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </LinkCardGrid>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-semibold">
            {messages.inventory.dashboard.operationalMetricsTitle}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {messages.inventory.dashboard.operationalMetricsDescription}
          </p>
        </div>
        <KpiRow
          density="compact"
          className={showProcurement ? "lg:grid-cols-3" : undefined}
        >
          {dashboardKpis.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              hint={kpi.hint}
              tone={kpi.tone}
              href={withBranch(kpi.href)}
              icon={kpi.icon}
              density="compact"
            />
          ))}
        </KpiRow>
      </div>

      {hasOpenInventoryWork ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <AppSection
            title={
              isOversight
                ? messages.inventory.dashboard.activeFlowsTitle
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
                    ctaLabel={messages.inventory.dashboard.openSlipCta}
                  />
                ))}
              </div>
            )}
          </AppSection>

          <AppSection
            title={
              isOversight
                ? messages.inventory.dashboard.oversightStocktakeProgressTitle
                : messages.inventory.dashboard.stocktakeProgress
            }
            description={messages.inventory.dashboard.activeStocktakes(
              activeStocktakeList.length,
            )}
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
                    ? messages.inventory.dashboard.oversightNoActiveStocktakes
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
                    metric={{
                      value: `${s.progress}%`,
                      label: messages.inventory.dashboard.progressMetricLabel,
                    }}
                    ctaLabel={messages.inventory.dashboard.openSessionCta}
                  />
                ))}
              </div>
            )}
          </AppSection>
        </div>
      ) : null}
    </AppPage>
  );
}
