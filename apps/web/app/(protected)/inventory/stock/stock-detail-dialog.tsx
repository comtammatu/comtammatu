"use client";

import Link from "next/link";
import {
  Pencil as IconPencil,
  Truck as IconTruck,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
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
  resolveStockDisplayUnit,
  stockUnitLabel,
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
  onAdjustStock?: () => void;
  onQuickIssue?: () => void;
}

export function StockDetailDialog({
  open,
  onOpenChange,
  detailData,
  isLoading = false,
  isTouchLayout,
  canAdjustStock = false,
  onAdjustStock,
  onQuickIssue,
}: StockDetailDialogProps) {
  const actionSize = isTouchLayout ? "touch" : "default";

  if (!open) return null;

  const ingredient = detailData?.ingredient;
  const status = detailData?.status;

  const totalStockUnits = ingredient
    ? formatStockUnits(detailData?.totalQty ?? 0, ingredient.units, formatQty)
    : { big: null, base: "" };

  const wacUnitLabel = ingredient
    ? stockUnitLabel(
        resolveStockDisplayUnit(ingredient.units),
        ingredient.unit || inventoryCommon.noValue,
      )
    : "";

  const totalValue = detailData?.valuation?.totalValue ?? null;
  const wac = detailData?.valuation?.wac ?? null;
  const valuationKind =
    detailData?.valuation == null
      ? null
      : resolveStockValuationDisplay({
          quantity: detailData.totalQty,
          unitCost: wac,
        });

  const titleContent = (
    <div className="flex flex-wrap items-center gap-2">
      <span>{ingredient ? `Thẻ kho - ${ingredient.name}` : detailCopy.eyebrow}</span>
      {status ? <StatusBadge domain="inventory" value={status} /> : null}
    </div>
  );

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={titleContent}
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

          {canAdjustStock && onAdjustStock ? (
            <Button
              type="button"
              variant="outline"
              size={actionSize}
              onClick={() => {
                onOpenChange(false);
                onAdjustStock();
              }}
            >
              <IconPencil data-icon="inline-start" />
              {stockCopy.actions.exception}
            </Button>
          ) : null}

          {onQuickIssue ? (
            <Button
              type="button"
              size={actionSize}
              onClick={() => {
                onOpenChange(false);
                onQuickIssue();
              }}
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
          {/* Sub-Header Metadata */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              SKU: <strong className="font-mono text-foreground">{ingredient.sku || inventoryCommon.noValue}</strong>
            </span>
            <span>·</span>
            <span>
              {stockCopy.table.categoryKind}: <strong className="text-foreground">{ingredient.category || inventoryCommon.noValue}</strong>
            </span>
            <span>·</span>
            <span>
              {stockCopy.table.stock}: <strong className="text-foreground">{ingredient.unit || inventoryCommon.noValue}</strong>
            </span>
          </div>

          {/* Core Metrics Cards (Tồn hiện tại, Giá trị tồn, WAC, Kiểm kê cuối) */}
          <Item variant="outline" className="grid grid-cols-2 gap-4 p-4 text-xs lg:grid-cols-4">
            <div>
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

            <div>
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

            <div>
              <span className="block font-medium text-muted-foreground">
                {stockCopy.table.wacPerUnit(wacUnitLabel)}
              </span>
              <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
                {valuationKind === "valued" && wac != null
                  ? formatVND(wac)
                  : valuationKind === "pending"
                    ? valuationCopy.pendingWac
                    : inventoryCommon.noValue}
              </span>
            </div>

            <div>
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

          {/* Detailed Thresholds & Storage Specifications */}
          {ingredient.min > 0 || ingredient.max > 0 || ingredient.reorder > 0 || detailData.storageTemperature ? (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: section heading */}
              <h4 className="text-sm font-medium">Định mức tồn kho & Bảo quản</h4>
              <Item variant="outline" className="grid grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-4">
                {ingredient.min > 0 ? (
                  <div>
                    {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: metric label */}
                    <span className="block text-muted-foreground">Tồn tối thiểu (Min)</span>
                    <span className="mt-1 block font-mono font-semibold tabular-nums text-foreground">
                      {formatQty(ingredient.min)} {ingredient.unit}
                    </span>
                  </div>
                ) : null}

                {ingredient.max > 0 ? (
                  <div>
                    {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: metric label */}
                    <span className="block text-muted-foreground">Tồn tối đa (Max)</span>
                    <span className="mt-1 block font-mono font-semibold tabular-nums text-foreground">
                      {formatQty(ingredient.max)} {ingredient.unit}
                    </span>
                  </div>
                ) : null}

                {ingredient.reorder > 0 ? (
                  <div>
                    {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: metric label */}
                    <span className="block text-muted-foreground">Điểm đặt hàng lại (Reorder)</span>
                    <span className="mt-1 block font-mono font-semibold tabular-nums text-foreground">
                      {formatQty(ingredient.reorder)} {ingredient.unit}
                    </span>
                  </div>
                ) : null}

                {detailData.storageTemperature ? (
                  <div>
                    {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: metric label */}
                    <span className="block text-muted-foreground">Nhiệt độ bảo quản</span>
                    <span className="mt-1 block font-medium text-foreground">
                      {detailData.storageTemperature}
                    </span>
                  </div>
                ) : null}
              </Item>
            </div>
          ) : null}

          {/* Locations Breakdown */}
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

          {/* Stock Movement History */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">{detailCopy.movementTitle}</h4>
              <span className="text-xs text-muted-foreground">
                {detailCopy.movementHint(detailData.movements.length)}
              </span>
            </div>

            {detailData.movements.length === 0 ? (
              <Item variant="outline" className="p-4 text-center text-xs text-muted-foreground">
                {detailCopy.noMovementDescription}
              </Item>
            ) : (
              <div className="flex flex-col gap-2">
                {detailData.movements.map((movement: StockIngredientDetailMovement) => {
                  const signedQty =
                    movement.quantityChange > 0
                      ? `+${formatQty(movement.quantityChange)}`
                      : formatQty(movement.quantityChange);
                  const referenceLabel = stockMovementReferenceLabel(movement);
                  const referenceHref = stockMovementReferenceHref({
                    movement,
                    branchId: detailData.branchId,
                  });
                  const locationDisplay =
                    movement.locationName === "main_warehouse" || movement.locationCode === "main_warehouse"
                      ? messages.inventory.ingredients.dialog.defaultFulfillSiteKindCentralSupply
                      : movement.locationName || inventoryCommon.noValue;

                  return (
                    <Item
                      key={movement.id}
                      variant="outline"
                      className="p-3 text-xs"
                    >
                      <div className="grid grid-cols-3 items-center gap-x-2 gap-y-1">
                        {/* Col 1, Row 1: Action Type */}
                        <div className="font-medium text-foreground truncate">
                          {stockMovementLabel(movement)}
                        </div>

                        {/* Col 2, Row 1: Reference Document Code */}
                        <div className="text-center font-mono truncate">
                          {referenceLabel ? (
                            referenceHref ? (
                              <Link
                                href={referenceHref}
                                className="font-medium text-primary hover:underline"
                              >
                                {referenceLabel}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{referenceLabel}</span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>

                        {/* Col 3, Row 1: Signed Quantity */}
                        <div className="text-right">
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              movement.quantityChange < 0
                                ? "text-destructive"
                                : movement.quantityChange > 0
                                  ? "text-success"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {signedQty} {ingredient.unit}
                          </span>
                        </div>

                        {/* Col 1, Row 2: Time */}
                        <div className="text-muted-foreground">
                          {formatDateTime(movement.createdAt)}
                        </div>

                        {/* Col 2, Row 2: Location Route */}
                        <div className="text-center text-muted-foreground truncate">
                          {locationDisplay}
                        </div>

                        {/* Col 3, Row 2: Reason or Unit Cost */}
                        <div className="text-right text-muted-foreground truncate">
                          {movement.reason
                            ? movement.reason
                            : movement.monetary?.unitCost != null
                              ? `${formatVND(movement.monetary.unitCost)} / ${ingredient.unit}`
                              : ""}
                        </div>
                      </div>
                    </Item>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </AppDialog>
  );
}
