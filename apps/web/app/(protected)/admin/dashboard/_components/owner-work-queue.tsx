import Link from "next/link";
import { MODULE_ACL } from "@comtammatu/shared/auth";
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
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import type { FinanceException } from "../../../finance/_lib/finance-cockpit";
import type { BranchOperatingRow } from "../actions";
import {
  financeExceptionSource,
  type OwnerWorkQueueItem,
  type OwnerWorkQueueSeverity,
} from "../owner-view-model";

const ADMIN_DASHBOARD_COPY = messages.admin.dashboard;

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

export function buildBranchQueueItems(
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

export function buildFinanceQueueItems(
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
            formatCount(row.paidOrders),
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

export function OwnerWorkQueueList({
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

export function BranchOperatingList({
  rows,
}: {
  rows: readonly BranchOperatingRow[];
}) {
  if (rows.length === 0) {
    return (
      <AppEmptyState
        compact
        title={ADMIN_DASHBOARD_COPY.branchStatusEmptyTitle}
        description={ADMIN_DASHBOARD_COPY.branchStatusEmptyDescription}
      />
    );
  }

  return (
    <ItemGroup className="gap-2">
      {rows.map((row) => (
        <BranchOperatingItem key={row.branchId} row={row} />
      ))}
    </ItemGroup>
  );
}
