"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  TriangleAlert as IconAlertTriangle,
  ArrowRight as IconArrowRight,
  ArrowLeftRight as IconArrowLeftRight,
  ClipboardCheck as IconClipboardCheck,
  SquareCheck as IconSquareCheck,
  ClipboardList as IconClipboardList,
  Clock as IconClock,
  Factory as IconBuildingFactory,
  Receipt as IconReceipt,
  Settings as IconSettings,
  Truck as IconTruck,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { formatVNTime, formatVNDate } from "@comtammatu/shared/time";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppPageHeader,
  AppSection,
  type AppLinkCardProps,
} from "@/components/surface";
import { formatVND } from "@lib/inventory/format";
import { getInventoryPaths, type InventoryRouteBase } from "./_lib/paths";
import { tNav } from "./_lib/dictionary";
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
  draftGrns: number;
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
  icon: LucideIcon;
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
        icon: IconClipboardList,
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
        icon: IconAlertTriangle,
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
        icon: IconArrowLeftRight,
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
          label: tNav("grn", "navigation"),
          href: paths.grn,
          primary: true,
        },
        {
          label: "Đơn mua hàng",
          href: paths.purchaseOrders,
        },
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

  const cards: FlowCard[] = [
    {
      key: "control",
      title: messages.inventory.dashboard.controlFlowTitle,
      description: messages.inventory.dashboard.controlDescription,
      icon: IconClipboardList,
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
      icon: props.showProcurement ? IconReceipt : IconTruck,
      statusLabel: props.showProcurement
        ? messages.inventory.dashboard.priceReviewLinesStatus(
            props.priceReviewCount,
          )
        : messages.inventory.dashboard.inboundNeedReceiveStatus(inbound.length),
      tone:
        (props.showProcurement && props.draftGrns > 0) || inbound.length > 0
          ? "info"
          : "default",
      actions: sourceActions,
    },
  ];

  if (props.showProduction) {
    cards.push({
      key: "production",
      title: messages.inventory.dashboard.productionFlowTitle,
      description: messages.inventory.dashboard.productionFlowDescription,
      icon: IconBuildingFactory,
      statusLabel: messages.inventory.dashboard.inboundOutboundStatus(
        inbound.length,
        outbound.length,
      ),
      tone: props.activeTransfers > 0 ? "info" : "default",
      actions: movementActions,
    });
  }

  cards.push({
    key: "catalog",
    title: messages.inventory.dashboard.catalogFlowTitle,
    description: messages.inventory.dashboard.catalogDescription,
    icon: IconSettings,
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
    ],
  });

  return cards;
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
        icon: <IconReceipt className="size-4" />,
        severity: "destructive",
      });
    return items.slice(0, 6);
  }

  if (siteKind === "branch") {
    if (pendingCountSlips > 0)
      items.push({
        key: "count-slips",
        title:
          messages.inventory.dashboard.countSlipsPendingTask(pendingCountSlips),
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
      description: INVENTORY_VI.dashboardPrepareReceivingHint,
      href: paths.grn,
      icon: <IconReceipt className="size-4" />,
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
    reorderAlerts,
    dataAsOf,
  } = props;

  const paths = getInventoryPaths(routeBase);
  const flowCards = buildFlowCards(props);
  const withBranch = (href: string) =>
    appendBranchId(href, props.selectedBranchId);
  const tasks = buildTasks(props);
  const isOversight =
    isInventoryOversightRole(props.userRole) &&
    !showProcurement &&
    !showProduction;

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

  return (
    <AppPage width="full" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.dashboard.headerEyebrow(siteKindLabel)}
        title={messages.inventory.dashboard.title}
        description={
          isOversight
            ? messages.inventory.dashboard.oversightTagline
            : messages.inventory.dashboard.headerTagline
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">{siteName}</span>
            {dataAsOf ? (
              <span className="inline-flex items-center gap-1 font-mono">
                <IconClock className="size-3" />
                {messages.inventory.dashboard.dataAsOfLabel}:{" "}
                {formatVNTime(dataAsOf)} ({formatVNDate(dataAsOf)})
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <span>{stockValueLabel}</span>
              <span
                className="font-mono font-semibold tabular-nums text-foreground"
                title={stockValueHint ?? undefined}
              >
                {stockValueText}
              </span>
            </span>
          </div>
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
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
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link
                  href={withBranch(
                    showProcurement ? paths.grn : paths.stock,
                  )}
                />
              }
            >
              {ACTIONS_VI.viewAll}
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {reorderAlerts.slice(0, 3).map((item) => (
              <AppLinkCard
                key={`r-${item.ingredientId}-${item.branchId}`}
                href={withBranch(
                  showProcurement ? paths.grn : paths.stock,
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

      <AppSection
        title={
          isOversight
            ? messages.inventory.dashboard.mainFlowsOversightTitle
            : messages.inventory.dashboard.mainFlowsTitle
        }
        description={
          isOversight
            ? messages.inventory.dashboard.mainFlowsOversightDescription
            : messages.inventory.dashboard.mainFlowsOperatorDescription
        }
        size="sm"
      >
        <ItemGroup>
          {flowCards.map((flow) => {
            const Icon = flow.icon;
            const primaryAction =
              flow.actions.find((action) => action.primary) ?? flow.actions[0];
            const secondaryActions = flow.actions.filter(
              (action) => action !== primaryAction,
            );

            return (
              <Item key={flow.key} variant="outline" size="sm">
                <ItemMedia variant="icon" className="text-primary">
                  <Icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle size="heading">{flow.title}</ItemTitle>
                  <ItemDescription>{flow.description}</ItemDescription>
                </ItemContent>
                <ItemActions className="ml-auto">
                  <Badge variant={flowBadgeVariant[flow.tone]}>
                    {flow.statusLabel}
                  </Badge>
                  {primaryAction ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link href={withBranch(primaryAction.href)} />}
                    >
                      {primaryAction.label}
                      <IconArrowRight className="size-4" />
                    </Button>
                  ) : null}
                </ItemActions>
                {secondaryActions.length > 0 ? (
                  <ItemFooter className="flex-wrap justify-start gap-1">
                    {secondaryActions.map((action) => (
                      <Button
                        key={action.href}
                        variant="ghost"
                        size="xs"
                        render={<Link href={withBranch(action.href)} />}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </ItemFooter>
                ) : null}
              </Item>
            );
          })}
        </ItemGroup>
      </AppSection>
    </AppPage>
  );
}
