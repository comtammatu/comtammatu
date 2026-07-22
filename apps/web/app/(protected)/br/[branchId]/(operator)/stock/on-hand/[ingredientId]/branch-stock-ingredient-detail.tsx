import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardList as IconClipboardList,
  PackageCheck as IconPackageCheck,
  Receipt as IconReceipt,
  Trash as IconTrash,
  Truck as IconTruck,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
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
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorActionSection,
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  stockMovementBadgeVariant,
  stockMovementLabel,
  stockMovementReferenceHref,
  stockMovementReferenceLabel,
  type StockIngredientDetailData,
} from "@lib/inventory/stock-on-hand-detail-model";
import { messages } from "@lib/messages";
import { formatDate, formatDateTime, formatQty } from "@lib/inventory/format";
import { formatStockUnits } from "@/(protected)/inventory/_lib/stock-unit-format";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
const detailCopy = stockCopy.detail;

function QuantityValue({
  qty,
  data,
  danger = false,
}: {
  qty: number;
  data: StockIngredientDetailData;
  danger?: boolean;
}) {
  const quantity = formatStockUnits(qty, data.ingredient.units, formatQty);

  return (
    <div className="min-w-0 text-right">
      <p
        className={
          danger
            ? "font-mono text-xl font-semibold tabular-nums text-destructive"
            : "font-mono text-xl font-semibold tabular-nums"
        }
      >
        {quantity.big ?? quantity.base}
      </p>
      {quantity.big !== null ? (
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {quantity.base}
        </p>
      ) : null}
    </div>
  );
}

export function BranchStockIngredientDetail({
  data,
  stockBasePath,
}: {
  data: StockIngredientDetailData;
  stockBasePath: string;
}) {
  const { ingredient } = data;
  const statusBadge = getStatusBadgeMeta("inventory", data.status);
  const atRisk = data.status === "low" || data.status === "out";
  const secondaryActions = [
    ...(data.permissions.canCreateTransfer
      ? [
          {
            key: "transfer",
            href: `${stockBasePath}/transfer`,
            icon: IconTruck,
            title: stockCopy.actions.transfer,
          },
        ]
      : []),
    ...(data.permissions.canCreateStocktake
      ? [
          {
            key: "stocktake",
            href: `${stockBasePath}/count`,
            icon: IconClipboardList,
            title: stockCopy.actions.stocktake,
          },
        ]
      : []),
    ...(data.permissions.canCreateIssue
      ? [
          {
            key: "issue",
            href: `${stockBasePath}/issues`,
            icon: IconTruck,
            title: stockCopy.actions.issueStock,
          },
        ]
      : []),
    ...(data.permissions.canWriteoff
      ? [
          {
            key: "waste",
            href: `${stockBasePath}/waste`,
            icon: IconTrash,
            title: stockCopy.actions.waste,
          },
        ]
      : []),
  ];

  return (
    <BranchOperatorPage
      title={ingredient.name}
      description={[ingredient.sku, ingredient.category, ingredient.unit]
        .filter(Boolean)
        .join(" · ")}
      hideHeaderOnMobile
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link href={stockBasePath} aria-label={detailCopy.backToStock} />
            }
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{ingredient.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[ingredient.sku, ingredient.unit].filter(Boolean).join(" · ")}
            </p>
          </div>
          <StatusBadge domain="inventory" value={data.status} size="sm" />
        </BranchOperatorControlBar>

        <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel
              title={stockCopy.table.currentStock}
              icon={IconPackageCheck}
              tone={atRisk ? "warning" : "default"}
              badge={{
                children: statusBadge.label,
                variant: statusBadge.variant,
              }}
              action={
                data.permissions.canReceiveGrn ? (
                  <Button
                    size="touch"
                    render={<Link href={`${stockBasePath}/grn/new`} />}
                  >
                    <IconReceipt data-icon="inline-start" />
                    {stockCopy.actions.receiveGoods}
                  </Button>
                ) : null
              }
              size="sm"
            >
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">
                    {ingredient.category || inventoryCommon.noValue}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stockCopy.table.lastCount}:{" "}
                    {data.latestCountedAt
                      ? formatDate(data.latestCountedAt)
                      : inventoryCommon.noValue}
                  </p>
                </div>
                <QuantityValue
                  qty={data.totalQty}
                  data={data}
                  danger={atRisk}
                />
              </div>
            </BranchOperatorPanel>

            <BranchOperatorPanel
              title={detailCopy.locationTitle}
              description={detailCopy.locationDescription}
              icon={IconPackageCheck}
              size="sm"
              contentClassName="gap-2"
            >
              {data.locations.length === 0 ? (
                <AppEmptyState
                  compact
                  mode="no-data"
                  icon={<IconPackageCheck />}
                  title={detailCopy.noLocationStockTitle}
                  description={detailCopy.noLocationStockDescription}
                />
              ) : (
                <ItemGroup className="gap-2" role="list">
                  {data.locations.map((location) => (
                    <div key={location.locationId} role="listitem">
                      <Item
                        variant="outline"
                        className="min-h-16 flex-nowrap touch-manipulation"
                      >
                        <ItemContent className="min-w-0 gap-1">
                          <ItemTitle className="line-clamp-none text-sm font-semibold">
                            {location.name}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none text-xs">
                            {location.code || inventoryCommon.noValue}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions className="shrink-0">
                          <QuantityValue qty={location.qty} data={data} />
                        </ItemActions>
                      </Item>
                    </div>
                  ))}
                </ItemGroup>
              )}
            </BranchOperatorPanel>

            <BranchOperatorPanel
              title={detailCopy.movementTitle}
              headerHint={detailCopy.movementHint(data.movements.length)}
              icon={IconClipboardList}
              size="sm"
              contentClassName="gap-2"
            >
              {data.movements.length === 0 ? (
                <AppEmptyState
                  compact
                  mode="no-data"
                  icon={<IconClipboardList />}
                  title={detailCopy.noMovementTitle}
                  description={detailCopy.noMovementDescription}
                />
              ) : (
                <ItemGroup className="gap-2" role="list">
                  {data.movements.map((movement) => {
                    const signedQty =
                      movement.quantityChange > 0
                        ? `+${formatQty(movement.quantityChange)}`
                        : formatQty(movement.quantityChange);
                    const referenceLabel =
                      stockMovementReferenceLabel(movement);
                    const referenceHref = stockMovementReferenceHref({
                      movement,
                      branchId: data.branchId,
                      branchStockBasePath: stockBasePath,
                    });

                    return (
                      <div key={movement.id} role="listitem">
                        <Item
                          variant="outline"
                          className="min-h-16 flex-col items-stretch gap-2 touch-manipulation"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <ItemContent className="min-w-0 gap-1">
                              <ItemTitle className="line-clamp-none text-sm font-semibold">
                                {stockMovementLabel(movement)}
                              </ItemTitle>
                              <ItemDescription className="line-clamp-none text-xs">
                                {formatDateTime(movement.createdAt)}
                                {movement.locationName
                                  ? ` · ${movement.locationName}`
                                  : ""}
                              </ItemDescription>
                            </ItemContent>
                            <Badge
                              variant={stockMovementBadgeVariant(
                                movement.quantityChange,
                              )}
                              className="shrink-0"
                            >
                              {signedQty} {ingredient.unit}
                            </Badge>
                          </div>
                          {referenceLabel || movement.reason ? (
                            <ItemDescription className="line-clamp-none text-xs">
                              {referenceLabel ? (
                                <>
                                  {detailCopy.reference}:{" "}
                                  {referenceHref ? (
                                    <Link
                                      href={referenceHref}
                                      className="font-medium text-primary hover:underline"
                                    >
                                      {referenceLabel}
                                    </Link>
                                  ) : (
                                    referenceLabel
                                  )}
                                </>
                              ) : null}
                              {referenceLabel && movement.reason ? " · " : null}
                              {movement.reason}
                            </ItemDescription>
                          ) : null}
                        </Item>
                      </div>
                    );
                  })}
                </ItemGroup>
              )}
            </BranchOperatorPanel>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel title={detailCopy.thresholdTitle} size="sm">
              <BranchOperatorDetailList
                rows={[
                  {
                    label: stockCopy.table.minThreshold,
                    value: `${formatQty(ingredient.min)} ${ingredient.unit}`,
                  },
                  {
                    label: detailCopy.storage,
                    value: data.storageTemperature ?? inventoryCommon.noValue,
                    muted: data.storageTemperature == null,
                  },
                ]}
                columns={1}
              />
            </BranchOperatorPanel>

            <BranchOperatorActionSection
              title={detailCopy.operationTitle}
              links={secondaryActions}
              columns={2}
              mobileColumns={1}
              size="sm"
            />
          </div>
        </div>

        <AppDetailFooter
          sticky
          trailing={
            <Button
              size="touch-lg"
              variant="outline"
              render={<Link href={stockBasePath} />}
            >
              <IconArrowLeft data-icon="inline-start" />
              {ACTIONS_VI.back}
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
