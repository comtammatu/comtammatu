"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { useOperatorUrlState } from "@lib/branch-operator/use-operator-url-state";
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

function BranchMovementItem({
  branchId,
  movement,
}: {
  branchId: number;
  movement: BranchStockMovement;
}) {
  const stockHref = `/br/${branchId}/stock/on-hand/${movement.ingredientId}`;
  const netChange = movement.closing - movement.opening;

  return (
    <div role="listitem">
      <Item asChild variant="outline" className="min-h-20 touch-manipulation">
        <Link href={stockHref}>
          <ItemContent className="min-w-0 gap-1">
            <ItemTitle className="truncate text-sm font-semibold">
              {movement.ingredientName}
            </ItemTitle>
            <ItemDescription className="line-clamp-none flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span>
                {quantityWithUnit(movement.opening, movement.unit)} →{" "}
                {quantityWithUnit(movement.closing, movement.unit)}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {signedQuantityWithUnit(netChange, movement.unit)}
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
  const { replaceParams, searchParams } = useOperatorUrlState();
  const view =
    searchParams.get("view") === "movement" ? "movement" : "variance";
  const stockBasePath = `/br/${branchId}/stock`;
  const periodLabel = `${formatVNDate(periodStart)} - ${formatVNDate(periodEnd)}`;

  return (
    <BranchOperatorPage
      title={reportCopy.pageTitle}
      description={`${branchName} · ${periodLabel}`}
      backHref={stockBasePath}
      backLabel="Tồn"
    >
      <Tabs
        value={view}
        onValueChange={(value) =>
          replaceParams({ view: value === "movement" ? "movement" : null })
        }
      >
        <TabsList className="grid min-h-12 w-full grid-cols-2">
          <TabsTrigger value="variance" className="min-h-11">
            {reportCopy.branchVarianceTitle}
          </TabsTrigger>
          <TabsTrigger value="movement" className="min-h-11">
            {reportCopy.branchMovementTitle}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <section
        className="min-w-0 touch-manipulation"
        aria-label={
          view === "variance"
            ? reportCopy.branchVarianceTitle
            : reportCopy.branchMovementTitle
        }
      >
        {view === "variance" ? (
          varianceLoadFailed ? (
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
          )
        ) : movementLoadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            icon={<IconChartBar />}
            title={reportCopy.branchLoadFailed}
          >
            <Button type="button" size="touch" onClick={() => router.refresh()}>
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
      </section>
    </BranchOperatorPage>
  );
}
