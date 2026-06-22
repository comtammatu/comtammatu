import Link from "next/link";
import {
  DollarSign as IconCurrencyDollar,
  Package as IconPackage,
  Wallet as IconWallet,
} from "lucide-react";
import { canAccess, MODULE_ACL } from "@comtammatu/shared/auth";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { buildCompareDelta } from "@/components/kpi/compare-chip";
import {
  fetchFinanceCockpit,
  type FinanceException,
} from "../../finance/_lib/finance-cockpit";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../../finance/_lib/finance-params";
import {
  fetchBranchOperatingStatus,
  type BranchOperatingRow,
} from "./actions";
import {
  buildOwnerDailyCommandSummary,
  financeExceptionSource,
  rankOwnerWorkQueue,
  type OwnerWorkQueueItem,
  type OwnerWorkQueueSeverity,
} from "./owner-view-model";

function BranchOperatingItem({ row }: { row: BranchOperatingRow }) {
  const posOpen = row.posOpenedAt !== null;

  return (
    <Item variant="outline" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle className="flex w-full flex-wrap items-center gap-2 text-sm">
          {row.branchName}
          <Badge variant={posOpen ? "success" : "warning"}>
            {posOpen && row.posOpenedAt
              ? ADMIN_DASHBOARD_COPY.branchPosOpenBadge(
                  formatVNTime(row.posOpenedAt),
                )
              : ADMIN_DASHBOARD_COPY.branchPosClosedBadge}
          </Badge>
          <Badge
            variant={
              row.printerOnline
                ? "success"
                : row.printerHasAgent
                  ? "destructive"
                  : "secondary"
            }
          >
            {row.printerOnline
              ? ADMIN_DASHBOARD_COPY.branchPrinterOnlineBadge
              : row.printerHasAgent
                ? ADMIN_DASHBOARD_COPY.branchPrinterOfflineBadge
                : ADMIN_DASHBOARD_COPY.branchPrinterNoAgentBadge}
          </Badge>
          {row.printerFailed24h > 0 ? (
            <Badge variant="destructive">
              {ADMIN_DASHBOARD_COPY.branchPrinterFailedBadge(
                row.printerFailed24h,
              )}
            </Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription>
          {ADMIN_DASHBOARD_COPY.branchSales(
            row.paidOrders.toLocaleString("vi-VN"),
            formatVND(row.todayRevenue),
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="w-full justify-start sm:w-auto sm:justify-end">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
        >
          <Link href={`/br/${String(row.branchId)}/dashboard`}>
            {ADMIN_DASHBOARD_COPY.branchOpenCta}
          </Link>
        </Button>
      </ItemActions>
    </Item>
  );
}

function formatCount(value: number): string {
  return value.toLocaleString("vi-VN");
}

function getQueueBadgeVariant(
  severity: OwnerWorkQueueSeverity,
): BadgeProps["variant"] {
  if (severity === "destructive") return "destructive";
  if (severity === "warning") return "warning";
  return "secondary";
}

function getQueueBadgeLabel(severity: OwnerWorkQueueSeverity): string {
  if (severity === "destructive") {
    return ADMIN_DASHBOARD_COPY.queueSeverityDestructive;
  }
  if (severity === "warning") return ADMIN_DASHBOARD_COPY.queueSeverityWarning;
  return ADMIN_DASHBOARD_COPY.queueSeverityNeutral;
}

function buildBranchQueueItems(
  branchStatus: readonly BranchOperatingRow[],
): OwnerWorkQueueItem[] {
  const items: OwnerWorkQueueItem[] = [];
  const posClosed = branchStatus.filter((row) => row.posOpenedAt === null);
  const printerFailed = branchStatus.filter((row) => row.printerFailed24h > 0);
  const printerOffline = branchStatus.filter(
    (row) => !row.printerHasAgent || !row.printerOnline,
  );
  const printerFailedCount = printerFailed.reduce(
    (sum, row) => sum + row.printerFailed24h,
    0,
  );

  if (printerFailedCount > 0 && printerFailed[0]) {
    items.push({
      id: "branch-printer-failed",
      severity: "destructive",
      title: ADMIN_DASHBOARD_COPY.queuePrinterFailedTitle,
      value: formatCount(printerFailedCount),
      description:
        ADMIN_DASHBOARD_COPY.queuePrinterFailedDescription(printerFailedCount),
      href: `/admin/settings/printers/jobs?branch=${String(
        printerFailed[0].branchId,
      )}&status=needs_attention`,
      actionLabel: ADMIN_DASHBOARD_COPY.openWorkItem,
      branchId: printerFailed[0].branchId,
      source: "branch",
    });
  }

  if (printerOffline.length > 0 && printerOffline[0]) {
    items.push({
      id: "branch-printer-offline",
      severity: "warning",
      title: ADMIN_DASHBOARD_COPY.queuePrinterOfflineTitle,
      value: formatCount(printerOffline.length),
      description: ADMIN_DASHBOARD_COPY.queuePrinterOfflineDescription(
        printerOffline.length,
      ),
      href: `/br/${String(printerOffline[0].branchId)}/settings/printers`,
      actionLabel: ADMIN_DASHBOARD_COPY.openWorkItem,
      branchId: printerOffline[0].branchId,
      source: "branch",
    });
  }

  if (posClosed.length > 0 && posClosed[0]) {
    items.push({
      id: "branch-pos-closed",
      severity: "warning",
      title: ADMIN_DASHBOARD_COPY.queuePosClosedTitle,
      value: formatCount(posClosed.length),
      description: ADMIN_DASHBOARD_COPY.queuePosClosedDescription(
        posClosed.length,
      ),
      href: `/br/${String(posClosed[0].branchId)}/pos`,
      actionLabel: ADMIN_DASHBOARD_COPY.openWorkItem,
      branchId: posClosed[0].branchId,
      source: "branch",
    });
  }

  return items;
}

function buildFinanceQueueItems(
  exceptions: readonly FinanceException[],
): OwnerWorkQueueItem[] {
  return exceptions
    .filter((item) => item.tone !== "neutral")
    .map((item) => {
      const source = financeExceptionSource(item);
      const severity =
        item.label === messages.finance.powerLite.exceptions.paymentDesyncLabel
          ? "destructive"
          : item.tone;

      return {
        id: `finance-${source}-${item.label}`,
        severity,
        title: item.label,
        value: item.value,
        description: item.hint,
        href: item.href ?? MODULE_ACL.finance.path,
        actionLabel: ADMIN_DASHBOARD_COPY.openWorkItem,
        source,
      };
    });
}

function OwnerWorkQueueList({
  items,
}: {
  items: readonly OwnerWorkQueueItem[];
}) {
  if (items.length === 0) {
    return (
      <AppEmptyState
        compact
        title={ADMIN_DASHBOARD_COPY.workQueueEmptyTitle}
        description={ADMIN_DASHBOARD_COPY.workQueueEmptyDescription}
      />
    );
  }

  return (
    <ItemGroup className="gap-2">
      {items.map((item) => (
        <Item key={item.id} variant="outline" className="items-start">
          <ItemContent className="min-w-0">
            <ItemTitle className="flex w-full flex-wrap items-center gap-2 text-sm">
              {item.title}
              <Badge variant={getQueueBadgeVariant(item.severity)}>
                {getQueueBadgeLabel(item.severity)}
              </Badge>
            </ItemTitle>
            <ItemDescription>{item.description}</ItemDescription>
          </ItemContent>
          <ItemActions className="w-full justify-between gap-2 sm:w-auto sm:justify-end">
            <span className="font-mono text-sm font-semibold tabular-nums">
              {item.value}
            </span>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={item.href}>{item.actionLabel}</Link>
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

const ADMIN_DASHBOARD_COPY = messages.admin.dashboard;

export default async function DashboardPage() {
  const ownerFinanceParams = parseFinanceParams({
    range: "mtd",
    compare: "prev_month",
  });
  const ownerFinanceRange = resolveFinanceRange(ownerFinanceParams);
  const [{ claims }, financeCockpit, branchStatus] = await Promise.all([
    loadAuthState(),
    fetchFinanceCockpit(ownerFinanceParams, ownerFinanceRange),
    fetchBranchOperatingStatus({
      startDate: ownerFinanceRange.start,
      endDate: ownerFinanceRange.end,
    }),
  ]);

  const role = claims.user_role;
  const reportsHref = canAccess(role, "reports")
    ? "/finance/revenue"
    : undefined;
  const financeHref = canAccess(role, "finance")
    ? "/finance?range=mtd&compare=prev_month"
    : undefined;
  const revenueHref = canAccess(role, "finance")
    ? "/finance/revenue?range=mtd&compare=prev_month"
    : reportsHref;
  const inventoryHref = canAccess(role, "inventory")
    ? MODULE_ACL.inventory.path
    : undefined;
  const workQueue = rankOwnerWorkQueue([
    ...buildBranchQueueItems(branchStatus),
    ...buildFinanceQueueItems(financeCockpit.exceptions),
  ]);
  const ownerSummary = buildOwnerDailyCommandSummary({
    branchStatus,
    workQueue,
  });
  const financeKpis = financeCockpit.kpis;
  const compareFinanceKpis = financeCockpit.compareKpis;
  const collectedMonth = Math.round(financeKpis.totalCollected);

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={ADMIN_DASHBOARD_COPY.pageTitle}
        description={ADMIN_DASHBOARD_COPY.pageDescription}
        badge={{
          children: ADMIN_DASHBOARD_COPY.pageBadge,
          variant: "secondary",
        }}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label={ADMIN_DASHBOARD_COPY.revenueLabel}
          value={formatVND(collectedMonth)}
          delta={buildCompareDelta(
            financeKpis.totalCollected,
            compareFinanceKpis?.totalCollected ?? 0,
            "higher_better",
          )}
          compareHint={ADMIN_DASHBOARD_COPY.compareHint}
          hint={ADMIN_DASHBOARD_COPY.revenueHelper}
          icon={<IconCurrencyDollar />}
          href={revenueHref}
        />
        <KpiCard
          label={ADMIN_DASHBOARD_COPY.operatingExpenseLabel}
          value={formatVND(Math.round(financeKpis.operatingExpense))}
          delta={buildCompareDelta(
            financeKpis.operatingExpense,
            compareFinanceKpis?.operatingExpense ?? 0,
            "lower_better",
          )}
          compareHint={ADMIN_DASHBOARD_COPY.compareHint}
          hint={ADMIN_DASHBOARD_COPY.operatingExpenseHelper}
          icon={<IconWallet />}
          href={financeHref}
        />
        <KpiCard
          label={ADMIN_DASHBOARD_COPY.inventoryValueLabel}
          value={formatVND(Math.round(financeKpis.inventoryValue))}
          hint={ADMIN_DASHBOARD_COPY.inventoryValueHelper}
          icon={<IconPackage />}
          href={inventoryHref}
        />
      </div>

      <div id="owner-work-queue">
        <AppSection
          title={ADMIN_DASHBOARD_COPY.workQueueTitle}
          description={ADMIN_DASHBOARD_COPY.workQueueDescription}
          badge={{
            children: ADMIN_DASHBOARD_COPY.workQueueBadge(
              ownerSummary.attentionTotal,
            ),
            variant: ownerSummary.attentionTotal > 0 ? "warning" : "success",
          }}
        >
          <OwnerWorkQueueList items={workQueue} />
        </AppSection>
      </div>

      <AppSection
        title={ADMIN_DASHBOARD_COPY.branchStatusTitle}
        description={ADMIN_DASHBOARD_COPY.branchStatusDescription}
      >
        {branchStatus.length === 0 ? (
          <AppEmptyState
            compact
            title={ADMIN_DASHBOARD_COPY.branchStatusEmptyTitle}
            description={ADMIN_DASHBOARD_COPY.branchStatusEmptyDescription}
          />
        ) : (
          <ItemGroup className="gap-2">
            {branchStatus.map((row) => (
              <BranchOperatingItem key={row.branchId} row={row} />
            ))}
          </ItemGroup>
        )}
      </AppSection>
    </AppPage>
  );
}
