import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  PackageCheck as IconPackageCheck,
  Receipt as IconReceipt,
  Trash as IconTrash,
  Truck as IconTruck,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import {
  AppBackLink,
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { loadStockIngredientDetailData } from "@lib/inventory/stock-on-hand-detail-data";
import {
  stockMovementBadgeVariant,
  stockMovementLabel,
  stockMovementReferenceHref,
  stockMovementReferenceLabel,
  type StockIngredientDetailData,
} from "@lib/inventory/stock-on-hand-detail-model";
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
} from "../../_lib/stock-unit-format";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
const valuationCopy = messages.inventory.valuationDisplay;
const detailCopy = stockCopy.detail;

export type UnitRef = { code: string };

export type IngredientUnitJoin = {
  unit_id: number;
  to_base_factor: number | null;
  is_base: boolean;
  is_active: boolean;
  units: UnitRef | UnitRef[] | null;
};

export type IngredientRow = {
  id: number;
  name: string;
  sku: string | null;
  category: string | null;
  unit_cost: number | null;
  min_stock_level: number | null;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string | null;
  ingredient_units: IngredientUnitJoin[] | null;
};

interface StockIngredientDetailPageContentProps {
  ingredientId: number;
  searchParams?: Promise<{ branch?: string | string[] }>;
}

function StockIngredientDetail({
  data,
}: {
  data: StockIngredientDetailData;
}) {
  const { ingredient } = data;
  const listHref = `/inventory/stock?branch=${data.branchId}`;

  if (data.coreDataLoadFailed) {
    return (
      <AppPage width="wide" scroll>
        <AppPageHeader
          title={ingredient.name}
          meta={[ingredient.sku, ingredient.category, ingredient.unit]
            .filter(Boolean)
            .join(" · ")}
          actions={<AppBackLink href={listHref}>{ACTIONS_VI.back}</AppBackLink>}
        />
        <AppEmptyState
          mode="error"
          title={stockCopy.loadFailed}
          description={stockCopy.loadFailedDescription}
        />
      </AppPage>
    );
  }

  const totalStockUnits = formatStockUnits(
    data.totalQty,
    ingredient.units,
    formatQty,
  );
  const compactUnit = resolveStockCompactUnit(data.totalQty, ingredient.units);
  const wacUnitLabel = stockUnitLabel(
    compactUnit,
    ingredient.unit || inventoryCommon.noValue,
  );
  const statusBadge = getStatusBadgeMeta("inventory", data.status);
  const totalValue = data.valuation?.totalValue ?? null;
  const wac = data.valuation?.wac ?? null;
  const displayWac = toStockDisplayUnitCost(wac, compactUnit);
  const valuationKind =
    data.valuation == null
      ? null
      : resolveStockValuationDisplay({
          quantity: data.totalQty,
          unitCost: wac,
        });
  const actionHrefs = {
    receive: `/inventory/grn?branch=${data.branchId}`,
    transfer: `/inventory/transfers?branch=${data.branchId}`,
    stocktake: `/inventory/stocktake?branch=${data.branchId}`,
    issues: "/inventory/consumption",
    waste: withControlSurfaceBranchScope(
      "/inventory/waste/new",
      String(data.branchId) as `${number}`,
      { prefixes: ["/inventory"] },
    ),
  };

  const thresholdUnits = formatStockUnits(
    ingredient.min,
    ingredient.units,
    formatQty,
  );

  return (
    <AppPage width="wide" scroll>
      <AppPageHeader
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span>{ingredient.name}</span>
            <StatusBadge
              domain="inventory"
              value={data.status}
              label={statusBadge.label}
            />
          </div>
        }
        meta={[ingredient.sku, ingredient.category, ingredient.unit]
          .filter(Boolean)
          .join(" · ")}
        breadcrumb={
          <AppBackLink href={listHref}>
            {detailCopy.backToStock}
          </AppBackLink>
        }
      />

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
              {data.latestCountedAt
                ? formatDate(data.latestCountedAt)
                : inventoryCommon.noValue}
            </span>
          </div>
        </Item>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">{detailCopy.locationTitle}</h4>
            {data.locations.length === 0 ? null : (
              <p className="text-xs text-muted-foreground">
                {detailCopy.locationDescription}
              </p>
            )}
          </div>
          <AppSection icon={<IconPackageCheck />}>
            {data.locations.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                title={detailCopy.noLocationStockTitle}
                description={detailCopy.noLocationStockDescription}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {data.locations.map((location) => {
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
                  const stockValue =
                    locationKind === "valued" &&
                    location.monetary?.avgUnitCost != null
                      ? location.qty * location.monetary.avgUnitCost
                      : null;

                  return (
                    <Item
                      key={location.locationId}
                      variant="outline"
                      className="flex-col items-stretch gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{location.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {location.code || inventoryCommon.noValue}
                          {location.locationKind
                            ? ` · ${detailCopy.locationKind}: ${location.locationKind}`
                            : ""}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {FORM_VI.quantity}
                          </p>
                          <p className="font-mono font-semibold tabular-nums">
                            {locationStockUnits.big ?? locationStockUnits.base}
                          </p>
                          {locationStockUnits.big !== null ? (
                            <p className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
                              {locationStockUnits.base}
                            </p>
                          ) : null}
                        </div>
                        {locationKind != null ? (
                          <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {stockCopy.table.stockValue}
                          </p>
                          <p
                            className={
                              locationKind === "pending"
                                ? "text-sm text-muted-foreground"
                                : "font-mono font-semibold tabular-nums"
                            }
                          >
                            {locationKind === "valued" && stockValue != null
                              ? formatVND(stockValue)
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
          </AppSection>

          <AppSection
            title={detailCopy.movementTitle}
            headerHint={detailCopy.movementHint(data.movements.length)}
            icon={<IconClipboardList />}
          >
            {data.movements.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                title={detailCopy.noMovementTitle}
                description={detailCopy.noMovementDescription}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {data.movements.map((movement) => {
                  const signedQty =
                    movement.quantityChange > 0
                      ? `+${formatQty(movement.quantityChange)}`
                      : formatQty(movement.quantityChange);
                  const referenceLabel = stockMovementReferenceLabel(movement);
                  const referenceHref = stockMovementReferenceHref({
                    movement,
                    branchId: data.branchId,
                  });

                  return (
                    <Item
                      key={movement.id}
                      variant="outline"
                      className="flex-col items-stretch gap-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {stockMovementLabel(movement)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(movement.createdAt)}
                            {movement.locationName
                              ? ` · ${movement.locationName}`
                              : ""}
                          </p>
                        </div>
                        <Badge
                          variant={stockMovementBadgeVariant(
                            movement.quantityChange,
                          )}
                          className="shrink-0"
                        >
                          {signedQty} {ingredient.unit}
                        </Badge>
                      </div>
                      {referenceLabel ||
                      movement.reason ||
                      movement.monetary?.unitCost != null ? (
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {referenceLabel ? (
                            <p>
                              {detailCopy.reference}:{" "}
                              {referenceHref ? (
                                <Link
                                  href={referenceHref}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {referenceLabel}
                                </Link>
                              ) : (
                                <span>{referenceLabel}</span>
                              )}
                            </p>
                          ) : null}
                          {movement.reason ? (
                            <p className="break-words">{movement.reason}</p>
                          ) : null}
                          {movement.monetary?.unitCost != null ? (
                            <p>
                              {stockCopy.table.movementUnitCost}:{" "}
                              {formatVND(movement.monetary.unitCost)} /{" "}
                              {ingredient.unit || inventoryCommon.noValue}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </Item>
                  );
                })}
              </div>
            )}
          </AppSection>
        </div>

        <div className="flex flex-col gap-3">
          <AppSection title={detailCopy.operationTitle}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.permissions.canReceiveGrn ? (
                <Button
                  size="touch"
                  render={<Link href={actionHrefs.receive} />}
                >
                  <IconReceipt className="size-3.5" />
                  {stockCopy.actions.receiveGoods}
                </Button>
              ) : null}
              {data.permissions.canCreateTransfer ? (
                <Button
                  size="touch"
                  variant="outline"
                  render={<Link href={actionHrefs.transfer} />}
                >
                  <IconTruck className="size-3.5" />
                  {stockCopy.actions.transfer}
                </Button>
              ) : null}
              {data.permissions.canCreateStocktake ? (
                <Button
                  size="touch"
                  variant="outline"
                  render={<Link href={actionHrefs.stocktake} />}
                >
                  <IconClipboardList className="size-3.5" />
                  {stockCopy.actions.stocktake}
                </Button>
              ) : null}
              {data.permissions.canCreateIssue ? (
                <Button
                  size="touch"
                  variant="outline"
                  render={<Link href={actionHrefs.issues} />}
                >
                  <IconTruck className="size-3.5" />
                  {stockCopy.actions.issueStock}
                </Button>
              ) : null}
              {data.permissions.canWriteoff ? (
                <Button
                  size="touch"
                  variant="outline"
                  render={<Link href={actionHrefs.waste} />}
                >
                  <IconTrash className="size-3.5" />
                  {stockCopy.actions.waste}
                </Button>
              ) : null}
            </div>
          </AppSection>

          <AppSection title={detailCopy.thresholdTitle} size="sm">
            <DescriptionList
              items={[
                {
                  term: detailCopy.storage,
                  description:
                    data.storageTemperature ?? inventoryCommon.noValue,
                },
              ]}
            />
          </AppSection>
        </div>
      </div>
      </div>
    </AppPage>
  );
}

export async function StockIngredientDetailPageContent({
  ingredientId,
  searchParams,
}: StockIngredientDetailPageContentProps) {
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  const params = searchParams ? await searchParams : {};
  const data = await loadStockIngredientDetailData({
    ingredientId,
    queryBranch: params.branch,
  });

  return <StockIngredientDetail data={data} />;
}

export default async function StockIngredientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ingredientId: string }>;
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const { ingredientId: rawIngredientId } = await params;
  const ingredientId = Number(rawIngredientId);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  const sp = await searchParams;
  const branchQuery = sp.branch ? `&branch=${sp.branch}` : "";
  redirect(`/inventory/stock?ingredientId=${ingredientId}&mode=view${branchQuery}`);
}
