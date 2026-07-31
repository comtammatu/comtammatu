import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getStatusBadgeMeta } from "@/components/status-badge";
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
import { formatStockUnits } from "../../_lib/stock-unit-format";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
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
  searchParams?: Promise<{ branchId?: string | string[] }>;
}

function OwnerStockIngredientDetail({
  data,
}: {
  data: StockIngredientDetailData;
}) {
  const { ingredient } = data;
  const listHref = `/inventory/stock?branchId=${data.branchId}`;

  if (data.coreDataLoadFailed) {
    return (
      <AppPage width="wide" scroll>
        <AppPageHeader
          title={ingredient.name}
          description={[ingredient.sku, ingredient.category, ingredient.unit]
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
    { preferredUnitId: ingredient.issue_unit_id },
  );
  const statusBadge = getStatusBadgeMeta("inventory", data.status);
  const totalValue = data.valuation?.totalValue ?? 0;
  const wac = data.valuation?.wac ?? 0;
  const actionHrefs = {
    receive: `/inventory/grn?branchId=${data.branchId}`,
    transfer: `/inventory/transfers?branchId=${data.branchId}`,
    stocktake: `/inventory/stocktake?branchId=${data.branchId}`,
    issues: "/inventory/consumption",
    waste: `/inventory/waste/new?branchId=${data.branchId}`,
  };

  return (
    <AppPage width="wide" scroll>
      <AppPageHeader
        title={ingredient.name}
        description={[ingredient.sku, ingredient.category, ingredient.unit]
          .filter(Boolean)
          .join(" · ")}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <AppBackLink href={listHref}>
            {detailCopy.backToStock}
          </AppBackLink>
        }
      />

      <AppSection size="sm">
        <DescriptionList
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          descriptionClassName="font-mono text-base font-semibold tabular-nums"
          items={[
            {
              term: stockCopy.table.currentStock,
              description: (
                <span className="flex flex-col">
                  <span>{totalStockUnits.big ?? totalStockUnits.base}</span>
                  {totalStockUnits.big !== null ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {totalStockUnits.base}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              term: stockCopy.table.stockValue,
              description: formatVND(totalValue),
            },
            {
              term: stockCopy.table.wacPerUnit(
                ingredient.unit || inventoryCommon.noValue,
              ),
              description:
                wac > 0 ? formatVND(wac) : inventoryCommon.noValue,
            },
            {
              term: stockCopy.table.lastCount,
              description: data.latestCountedAt
                ? formatDate(data.latestCountedAt)
                : inventoryCommon.noValue,
            },
          ]}
        />
      </AppSection>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <AppSection
            title={detailCopy.locationTitle}
            description={detailCopy.locationDescription}
            icon={<IconPackageCheck />}
          >
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
                    { preferredUnitId: ingredient.issue_unit_id },
                  );
                  const stockValue = location.monetary
                    ? location.qty * (location.monetary.avgUnitCost ?? 0)
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
                        {stockValue != null ? (
                          <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {stockCopy.table.stockValue}
                          </p>
                          <p className="font-mono font-semibold tabular-nums">
                            {formatVND(stockValue)}
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

          <AppSection title={detailCopy.thresholdTitle}>
            <DescriptionList
              items={[
                {
                  term: stockCopy.table.currentStock,
                  description: `${formatQty(data.totalQty)} ${ingredient.unit}`,
                },
                {
                  term: stockCopy.table.minThreshold,
                  description: `${formatQty(ingredient.min)} ${ingredient.unit}`,
                },
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
    queryBranchId: params.branchId,
  });

  return <OwnerStockIngredientDetail data={data} />;
}

export default async function StockIngredientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ingredientId: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { ingredientId: rawIngredientId } = await params;
  const ingredientId = Number(rawIngredientId);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  return (
    <StockIngredientDetailPageContent
      ingredientId={ingredientId}
      searchParams={searchParams}
    />
  );
}
