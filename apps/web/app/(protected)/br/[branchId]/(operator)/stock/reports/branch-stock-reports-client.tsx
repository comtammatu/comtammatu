"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ChartBar as IconChartBar,
  ChevronRight as IconChevronRight,
  RefreshCw as IconRefresh,
  TriangleAlert as IconTriangleAlert,
} from "lucide-react";
import { formatPercent, formatQuantity } from "@comtammatu/shared/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import type {
  BranchStockMovement,
  BranchStockVariance,
} from "@lib/inventory/branch-stock-report-model";
import { messages } from "@lib/messages";

const reportCopy = messages.inventory.reports;

function quantityWithUnit(quantity: number, unit: string) {
  return `${formatQuantity(quantity)} ${unit || reportCopy.branchUnitUnavailable}`;
}

function signedQuantityWithUnit(quantity: number, unit: string) {
  const sign = quantity > 0 ? "+" : quantity < 0 ? "-" : "";
  return `${sign}${quantityWithUnit(Math.abs(quantity), unit)}`;
}

function BranchVarianceItem({
  branchId,
  variance,
}: {
  branchId: number;
  variance: BranchStockVariance;
}) {
  const stockHref = `/br/${branchId}/stock/on-hand/${variance.ingredientId}`;
  const badgeVariant = variance.flag === "critical" ? "destructive" : "warning";

  return (
    <div role="listitem">
      <Item asChild variant="outline" className="min-h-20 touch-manipulation">
        <Link href={stockHref}>
          <ItemContent className="min-w-0 gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <ItemTitle className="truncate text-sm font-semibold">
                {variance.ingredientName}
              </ItemTitle>
              <Badge variant={badgeVariant} className="shrink-0 tabular-nums">
                {formatPercent(variance.variancePct)}
              </Badge>
            </div>
            <ItemDescription className="line-clamp-none flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span>
                {reportCopy.branchActual}:{" "}
                {quantityWithUnit(variance.actual, variance.unit)}
              </span>
              <span>
                {reportCopy.branchTheoretical}:{" "}
                {quantityWithUnit(variance.theoretical, variance.unit)}
              </span>
            </ItemDescription>
          </ItemContent>
          <ItemActions className="self-center text-muted-foreground">
            <IconChevronRight />
          </ItemActions>
        </Link>
      </Item>
    </div>
  );
}

function getMovementMetrics(movement: BranchStockMovement) {
  return [
    { label: reportCopy.branchGrnReceipt, value: movement.grnReceipt },
    { label: reportCopy.branchTransferIn, value: movement.transferIn },
    { label: reportCopy.branchTransferOut, value: movement.transferOut },
    { label: reportCopy.branchConsumption, value: movement.consumption },
    {
      label: reportCopy.branchProductionConsumption,
      value: movement.productionConsumption,
    },
    {
      label: reportCopy.branchProductionOutput,
      value: movement.productionOutput,
    },
    { label: reportCopy.branchAdjustment, value: movement.adjustment },
  ].filter((metric) => metric.value !== 0);
}

function BranchMovementItem({
  branchId,
  movement,
}: {
  branchId: number;
  movement: BranchStockMovement;
}) {
  const stockHref = `/br/${branchId}/stock/on-hand/${movement.ingredientId}`;
  const metrics = getMovementMetrics(movement);

  return (
    <div role="listitem">
      <Item asChild variant="outline" className="min-h-28 touch-manipulation">
        <Link href={stockHref}>
          <ItemContent className="min-w-0 gap-2">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <ItemTitle className="truncate text-sm font-semibold">
                  {movement.ingredientName}
                </ItemTitle>
                <ItemDescription className="line-clamp-none mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                  <span>
                    {reportCopy.branchOpening}:{" "}
                    {quantityWithUnit(movement.opening, movement.unit)}
                  </span>
                  <span>
                    {reportCopy.branchClosing}:{" "}
                    {quantityWithUnit(movement.closing, movement.unit)}
                  </span>
                </ItemDescription>
              </div>
              <IconChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.label} className="min-w-0">
                  <p className="leading-tight text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="break-words font-mono font-medium leading-tight tabular-nums">
                    {signedQuantityWithUnit(metric.value, movement.unit)}
                  </p>
                </div>
              ))}
            </div>
          </ItemContent>
        </Link>
      </Item>
    </div>
  );
}

export function BranchStockReportsClient({
  branchId,
  branchName,
  periodStart,
  periodEnd,
  varianceLoadFailed,
  movementLoadFailed,
  varianceExceptions,
  movementHighlights,
}: {
  branchId: number;
  branchName: string;
  periodStart: string;
  periodEnd: string;
  varianceLoadFailed: boolean;
  movementLoadFailed: boolean;
  varianceExceptions: BranchStockVariance[];
  movementHighlights: BranchStockMovement[];
}) {
  const router = useRouter();
  const stockBasePath = `/br/${branchId}/stock`;
  const periodLabel = `${formatVNDate(periodStart)} - ${formatVNDate(periodEnd)}`;
  const varianceTone = varianceExceptions.some((row) => row.flag === "critical")
    ? "destructive"
    : varianceExceptions.length > 0
      ? "warning"
      : "default";

  return (
    <BranchOperatorPage
      title={reportCopy.pageTitle}
      description={branchName}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-28">
        <BranchOperatorControlBar className="sm:hidden">
          <Button asChild variant="ghost" size="icon-touch">
            <Link href={stockBasePath} aria-label={ACTIONS_VI.back}>
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {reportCopy.pageTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName}
            </p>
          </div>
        </BranchOperatorControlBar>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
          <BranchOperatorPanel
            title={reportCopy.branchVarianceTitle}
            description={reportCopy.branchVarianceDescription}
            headerHint={periodLabel}
            icon={IconTriangleAlert}
            tone={varianceTone}
            size="sm"
            contentClassName="gap-3"
          >
            {varianceLoadFailed ? (
              <AppEmptyState
                compact
                mode="error"
                icon={<IconTriangleAlert />}
                title={reportCopy.branchLoadFailed}
              >
                <Button
                  type="button"
                  size="touch"
                  onClick={() => router.refresh()}
                >
                  <IconRefresh data-icon="inline-start" />
                  {ACTIONS_VI.retry}
                </Button>
              </AppEmptyState>
            ) : varianceExceptions.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                icon={<IconTriangleAlert />}
                title={reportCopy.branchVarianceEmptyTitle}
                description={reportCopy.branchVarianceEmptyDescription}
              />
            ) : (
              <ItemGroup className="gap-2" role="list">
                {varianceExceptions.map((variance) => (
                  <BranchVarianceItem
                    key={variance.ingredientId}
                    branchId={branchId}
                    variance={variance}
                  />
                ))}
              </ItemGroup>
            )}
          </BranchOperatorPanel>

          <BranchOperatorPanel
            title={reportCopy.branchMovementTitle}
            description={reportCopy.branchMovementDescription}
            headerHint={reportCopy.currentMonthSnapshot}
            icon={IconChartBar}
            size="sm"
            contentClassName="gap-3"
          >
            {movementLoadFailed ? (
              <AppEmptyState
                compact
                mode="error"
                icon={<IconChartBar />}
                title={reportCopy.branchLoadFailed}
              >
                <Button
                  type="button"
                  size="touch"
                  onClick={() => router.refresh()}
                >
                  <IconRefresh data-icon="inline-start" />
                  {ACTIONS_VI.retry}
                </Button>
              </AppEmptyState>
            ) : movementHighlights.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                icon={<IconChartBar />}
                title={reportCopy.branchMovementEmptyTitle}
                description={reportCopy.branchMovementEmptyDescription}
              />
            ) : (
              <ItemGroup className="gap-2" role="list">
                {movementHighlights.map((movement) => (
                  <BranchMovementItem
                    key={movement.ingredientId}
                    branchId={branchId}
                    movement={movement}
                  />
                ))}
              </ItemGroup>
            )}
          </BranchOperatorPanel>
        </div>
      </div>
    </BranchOperatorPage>
  );
}
