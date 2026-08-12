"use client";

import Link from "next/link";
import {
  ArrowDownToLine as IconArrowDownToLine,
  ArrowUpFromLine as IconArrowUpFromLine,
  Pencil as IconPencil,
  SquarePen as IconSquarePen,
  Truck as IconTruck,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui/lib/utils";
import { AppDialog } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { messages } from "@lib/messages";
import {
  formatDate,
  formatDateTime,
  formatQty,
  formatVND,
} from "@lib/inventory/format";
import { resolveStockValuationDisplay } from "@lib/inventory/valuation-display";
import {
  formatStockUnits,
  resolveStockCompactUnit,
  stockUnitLabel,
  toStockDisplayUnitCost,
} from "../_lib/stock-unit-format";
import {
  stockMovementLabel,
  stockMovementReferenceHref,
  stockMovementReferenceLabel,
  type StockIngredientDetailData,
  type StockIngredientDetailMovement,
} from "@lib/inventory/stock-on-hand-detail-model";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
const valuationCopy = messages.inventory.valuationDisplay;
const detailCopy = stockCopy.detail;

export interface StockDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailData: StockIngredientDetailData | null;
  isLoading?: boolean;
  isTouchLayout: boolean;
  canAdjustStock?: boolean;
  canEditIngredient?: boolean;
  onAdjustStock?: () => void;
  onEditIngredient?: () => void;
  onQuickIssue?: () => void;
}

export function StockDetailDialog({
  open,
  onOpenChange,
  detailData,
  isLoading = false,
  isTouchLayout,
  canAdjustStock = false,
  canEditIngredient = false,
  onAdjustStock,
  onEditIngredient,
  onQuickIssue,
}: StockDetailDialogProps) {
  const actionSize = isTouchLayout ? "touch" : "default";

  if (!open) return null;

  const ingredient = detailData?.ingredient;
  const status = detailData?.status;

  const totalStockUnits = ingredient
    ? formatStockUnits(detailData?.totalQty ?? 0, ingredient.units, formatQty)
    : { big: null, base: "" };

  const compactUnit = ingredient
    ? resolveStockCompactUnit(
        detailData?.totalQty ?? 0,
        ingredient.units,
      )
    : undefined;
  const wacUnitLabel = ingredient
    ? stockUnitLabel(
        compactUnit,
        ingredient.unit || inventoryCommon.noValue,
      )
    : "";

  const totalValue = detailData?.valuation?.totalValue ?? null;
  const wac = detailData?.valuation?.wac ?? null;
  const displayWac = toStockDisplayUnitCost(wac, compactUnit);
  const valuationKind =
    detailData?.valuation == null
      ? null
      : resolveStockValuationDisplay({
          quantity: detailData.totalQty,
          unitCost: wac,
        });

  const thresholdUnits = ingredient
    ? formatStockUnits(ingredient.min, ingredient.units, formatQty)
    : { big: null, base: "" };

  const titleContent = (
    <div className="flex flex-wrap items-center gap-2">
      <span>{ingredient ? `Thẻ kho - ${ingredient.name}` : detailCopy.eyebrow}</span>
      {status ? <StatusBadge domain="inventory" value={status} /> : null}
    </div>
  );

  const skuDescription = ingredient ? (
    <span className="font-mono">
      {stockCopy.table.sku}: {ingredient.sku || inventoryCommon.noValue}
    </span>
  ) : undefined;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={titleContent}
      description={skuDescription}
      variant="document"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size={actionSize}
            onClick={() => onOpenChange(false)}
          >
            {ACTIONS_VI.close}
          </Button>

          {canEditIngredient && onEditIngredient ? (
            <Button
              type="button"
              variant="outline"
              size={actionSize}
              onClick={onEditIngredient}
            >
              <IconSquarePen data-icon="inline-start" />
              {stockCopy.actions.edit}
            </Button>
          ) : null}

          {canAdjustStock && onAdjustStock ? (
            <Button
              type="button"
              variant="outline"
              size={actionSize}
              onClick={onAdjustStock}
            >
              <IconPencil data-icon="inline-start" />
              {stockCopy.actions.exception}
            </Button>
          ) : null}

          {onQuickIssue ? (
            <Button
              type="button"
              size={actionSize}
              onClick={onQuickIssue}
            >
              <IconTruck data-icon="inline-start" />
              {stockCopy.actions.issueStock}
            </Button>
          ) : null}
        </div>
      }
    >
      {isLoading || !detailData || !ingredient ? (
        <div className="flex items-center justify-center p-4">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Item
            variant="outline"
            className="grid grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-3 lg:grid-cols-5"
          >
            <div className="min-w-0">
              <span className="block font-medium text-muted-foreground">
                {stockCopy.table.currentStock}
              </span>
              <span className="mt-1 flex flex-col font-mono text-base font-semibold tabular-nums text-foreground">
                <span>{totalStockUnits.big ?? totalStockUnits.base}</span>
                {totalStockUnits.big !== null ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {totalStockUnits.base}
                  </span>
                ) : null}
              </span>
            </div>

            <div className="min-w-0">
              <span className="block font-medium text-muted-foreground">
                {stockCopy.table.stockValue}
              </span>
              <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
                {valuationKind === "valued" && totalValue != null
                  ? formatVND(totalValue)
                  : valuationKind === "pending"
                    ? valuationCopy.pendingWac
                    : inventoryCommon.noValue}
              </span>
            </div>

            <div className="min-w-0">
              <span className="block font-medium text-muted-foreground">
                {stockCopy.table.wac}
              </span>
              <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
                {valuationKind === "valued" && displayWac != null
                  ? `${formatVND(displayWac)} / ${wacUnitLabel}`
                  : valuationKind === "pending"
                    ? valuationCopy.pendingWac
                    : inventoryCommon.noValue}
              </span>
            </div>

            <div className="min-w-0">
              <span className="block font-medium text-muted-foreground">
                {stockCopy.table.threshold}
              </span>
              <span className="mt-1 flex flex-col font-mono text-base font-semibold tabular-nums text-foreground">
                {ingredient.min > 0 ? (
                  <>
                    <span>{thresholdUnits.big ?? thresholdUnits.base}</span>
                    {thresholdUnits.big !== null ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        {thresholdUnits.base}
                      </span>
                    ) : null}
                  </>
                ) : (
                  inventoryCommon.noValue
                )}
              </span>
            </div>

            <div className="min-w-0">
              <span className="block font-medium text-muted-foreground">
                {stockCopy.table.lastCount}
              </span>
              <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
                {detailData.latestCountedAt
                  ? formatDate(detailData.latestCountedAt)
                  : inventoryCommon.noValue}
              </span>
            </div>
          </Item>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">{detailCopy.locationTitle}</h4>

            {detailData.locations.length === 0 ? (
              <Item variant="outline" className="p-4 text-center text-xs text-muted-foreground">
                {detailCopy.noLocationStockDescription}
              </Item>
            ) : (
              <div className="flex flex-col gap-2">
                {detailData.locations.map((location) => {
                  const locationStockUnits = formatStockUnits(
                    location.qty,
                    ingredient.units,
                    formatQty,
                  );
                  const locationKind =
                    location.monetary == null
                      ? null
                      : resolveStockValuationDisplay({
                          quantity: location.qty,
                          unitCost: location.monetary.avgUnitCost,
                        });
                  const locationStockValue =
                    locationKind === "valued" &&
                    location.monetary?.avgUnitCost != null
                      ? location.qty * location.monetary.avgUnitCost
                      : null;

                  return (
                    <Item
                      key={location.locationId}
                      variant="outline"
                      className="flex items-center justify-between p-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {location.name === "main_warehouse" || location.code === "main_warehouse"
                            ? messages.inventory.ingredients.dialog.defaultFulfillSiteKindCentralSupply
                            : location.name}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 sm:min-w-64">
                        <div>
                          <p className="text-muted-foreground">{FORM_VI.quantity}</p>
                          <p className="font-mono font-semibold tabular-nums text-foreground">
                            {locationStockUnits.big ?? locationStockUnits.base}
                          </p>
                        </div>
                        {locationKind != null ? (
                          <div className="text-right">
                            <p className="text-muted-foreground">{stockCopy.table.stockValue}</p>
                            <p className="font-mono font-semibold tabular-nums text-foreground">
                              {locationKind === "valued" && locationStockValue != null
                                ? formatVND(locationStockValue)
                                : locationKind === "pending"
                                  ? valuationCopy.pendingWac
                                  : inventoryCommon.noValue}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </Item>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium">{detailCopy.movementTitle}</h4>
              <span className="shrink-0 text-xs text-muted-foreground">
                {detailCopy.movementHint(detailData.movements.length)}
              </span>
            </div>

            {detailData.movements.length === 0 ? (
              <Item variant="outline" className="p-4 text-center text-xs text-muted-foreground">
                {detailCopy.noMovementDescription}
              </Item>
            ) : (
              <Item
                variant="outline"
                className="flex-col flex-nowrap items-stretch overflow-hidden p-0 text-xs"
              >
                <div className="w-full min-w-0">
                  <div
                    className="grid grid-cols-3 gap-3 border-b bg-muted/30 px-3 py-2 font-medium text-muted-foreground"
                    role="row"
                  >
                    <span>{detailCopy.movementColOperation}</span>
                    <span>{detailCopy.movementColWarehouse}</span>
                    <span className="text-right">
                      {detailCopy.movementColQuantity}
                    </span>
                  </div>

                  <div className="divide-y" role="list">
                    {detailData.movements.map((movement: StockIngredientDetailMovement) => {
                      const movementUnits = formatStockUnits(
                        movement.quantityChange,
                        ingredient.units,
                        formatQty,
                      );
                      const withSignedPrefix = (value: string) =>
                        movement.quantityChange > 0 ? `+${value}` : value;
                      const movementPrimary = withSignedPrefix(
                        movementUnits.big ?? movementUnits.base,
                      );
                      const movementBase =
                        movementUnits.big !== null
                          ? withSignedPrefix(movementUnits.base)
                          : null;
                      const referenceLabel = stockMovementReferenceLabel(movement);
                      const referenceHref = stockMovementReferenceHref({
                        movement,
                        branchId: detailData.branchId,
                      });
                      const locationDisplay =
                        movement.locationName === "main_warehouse" ||
                        movement.locationCode === "main_warehouse"
                          ? messages.inventory.ingredients.dialog
                              .defaultFulfillSiteKindCentralSupply
                          : movement.locationName || inventoryCommon.noValue;
                      const isInbound = movement.quantityChange > 0;
                      const isOutbound = movement.quantityChange < 0;
                      const DirectionIcon = isInbound
                        ? IconArrowDownToLine
                        : isOutbound
                          ? IconArrowUpFromLine
                          : null;

                      return (
                        <div
                          key={movement.id}
                          role="listitem"
                          className="grid grid-cols-3 items-center gap-3 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {stockMovementLabel(movement)}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {formatDateTime(movement.createdAt)}
                            </p>
                          </div>

                          <div className="flex min-w-0 items-center gap-2">
                            {DirectionIcon ? (
                              <span
                                className={cn(
                                  "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
                                  isInbound
                                    ? "bg-success/10 text-success"
                                    : "bg-destructive/10 text-destructive",
                                )}
                                aria-hidden
                              >
                                <DirectionIcon className="size-3.5" />
                              </span>
                            ) : (
                              <span className="size-7 shrink-0" aria-hidden />
                            )}
                            <span className="truncate text-foreground">
                              {locationDisplay}
                            </span>
                          </div>

                          <div className="min-w-0 text-right">
                            <p
                              className={cn(
                                "flex flex-col font-mono font-semibold tabular-nums",
                                isOutbound
                                  ? "text-destructive"
                                  : isInbound
                                    ? "text-success"
                                    : "text-muted-foreground",
                              )}
                            >
                              <span>{movementPrimary}</span>
                              {movementBase ? (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {movementBase}
                                </span>
                              ) : null}
                            </p>
                            {referenceLabel ? (
                              referenceHref ? (
                                <Link
                                  href={referenceHref}
                                  className="block truncate text-primary hover:underline"
                                >
                                  {referenceLabel}
                                </Link>
                              ) : (
                                <span className="block truncate text-muted-foreground">
                                  {referenceLabel}
                                </span>
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Item>
            )}
          </div>
        </div>
      )}
    </AppDialog>
  );
}
