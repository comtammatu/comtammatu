"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,
  ClipboardList as IconClipboardList,
  ExternalLink as IconExternalLink,
  MoreHorizontal as IconMore,
  PackageCheck as IconPackageCheck,
  Receipt as IconReceipt,
  ShoppingCart as IconPurchase,
  Trash as IconTrash,
  Truck as IconTruck,
} from "lucide-react";
import type { BranchKind } from "@comtammatu/shared/auth";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppBackLink, AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorDetailList,
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  countStockMovementsByCategory,
  filterStockMovements,
  stockMovementBadgeVariant,
  stockMovementLabel,
  stockMovementReferenceHref,
  stockMovementReferenceLabel,
  type StockIngredientDetailData,
  type StockMovementCategoryKey,
} from "@lib/inventory/stock-on-hand-detail-model";
import { messages } from "@lib/messages";
import { PURCHASE_ORDER_CREATE_HREF } from "@lib/inventory/purchase-order-paths";
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

type PrimaryAction = {
  key: string;
  href: string;
  label: string;
  icon: typeof IconTruck;
};

function resolvePrimaryActions({
  stockBasePath,
  branchKind,
  permissions,
}: {
  stockBasePath: string;
  branchKind: BranchKind;
  permissions: StockIngredientDetailData["permissions"];
}): PrimaryAction[] {
  if (branchKind === "central_supply") {
    const actions: PrimaryAction[] = [];
    if (permissions.canReceiveGrn) {
      actions.push({
        key: "grn",
        href: `${stockBasePath}/grn`,
        label: stockCopy.actions.openGrn,
        icon: IconTruck,
      });
    }
    if (permissions.canManagePurchaseRequest) {
      actions.push({
        key: "po",
        href: PURCHASE_ORDER_CREATE_HREF,
        label: messages.inventory.po.createAction,
        icon: IconPurchase,
      });
    }
    return actions;
  }
  if (branchKind === "central_kitchen") {
    if (!permissions.canCreateTransfer) return [];
    return [
      {
        key: "request-cs",
        href: `${stockBasePath}/transfer/new?direction=pull`,
        label: stockCopy.actions.requestFromCentralSupply,
        icon: IconReceipt,
      },
    ];
  }
  if (!permissions.canCreateTransfer) return [];
  return [
    {
      key: "request",
      href: `${stockBasePath}/transfer/new?direction=pull`,
      label: stockCopy.actions.requestStock,
      icon: IconReceipt,
    },
  ];
}

const MOVEMENT_CATEGORY_KEYS: StockMovementCategoryKey[] = [
  "all",
  "consumption",
  "transfer",
  "grn",
  "adjustment",
  "waste",
];

function resolveCategoryModuleLink({
  category,
  stockBasePath,
}: {
  category: StockMovementCategoryKey;
  stockBasePath: string;
}): { href: string; label: string } | null {
  switch (category) {
    case "consumption":
      return {
        href: `${stockBasePath}/consumption`,
        label: stockCopy.actions.issueStock,
      };
    case "transfer":
      return {
        href: `${stockBasePath}/transfer`,
        label: stockCopy.actions.transfer,
      };
    case "grn":
      return {
        href: `${stockBasePath}/grn`,
        label: stockCopy.actions.openGrn,
      };
    case "adjustment":
      return {
        href: `${stockBasePath}/stocktake`,
        label: stockCopy.actions.stocktake,
      };
    case "waste":
      return {
        href: `${stockBasePath}/waste`,
        label: stockCopy.actions.waste,
      };
    default:
      return null;
  }
}

export function BranchStockIngredientDetail({
  data,
  stockBasePath,
  branchKind,
}: {
  data: StockIngredientDetailData;
  stockBasePath: string;
  branchKind: BranchKind;
}) {
  const { ingredient } = data;
  const onHandHref = `${stockBasePath}/on-hand`;
  const [selectedCategory, setSelectedCategory] =
    useState<StockMovementCategoryKey>("all");
  const [isExpanded, setIsExpanded] = useState(false);

  const categoryCounts = useMemo(
    () => countStockMovementsByCategory(data.movements),
    [data.movements],
  );

  const filteredMovements = useMemo(
    () => filterStockMovements(data.movements, selectedCategory),
    [data.movements, selectedCategory],
  );

  const INITIAL_VISIBLE_COUNT = 8;
  const visibleMovements = isExpanded
    ? filteredMovements
    : filteredMovements.slice(0, INITIAL_VISIBLE_COUNT);
  const remainingCount = filteredMovements.length - visibleMovements.length;
  const categoryModule = resolveCategoryModuleLink({
    category: selectedCategory,
    stockBasePath,
  });

  if (data.coreDataLoadFailed) {
    return (
      <BranchOperatorPage
        title={ingredient.name}
        description={[ingredient.sku, ingredient.category, ingredient.unit]
          .filter(Boolean)
          .join(" · ")}
      >
        <AppEmptyState
          compact
          mode="error"
          title={stockCopy.loadFailed}
          description={stockCopy.loadFailedDescription}
        />
      </BranchOperatorPage>
    );
  }

  const atRisk = data.status === "low" || data.status === "out";
  const primaryActions = resolvePrimaryActions({
    stockBasePath,
    branchKind,
    permissions: data.permissions,
  });
  const primaryAction = primaryActions[0] ?? null;
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
            href: `${stockBasePath}/stocktake`,
            icon: IconClipboardList,
            title: stockCopy.actions.stocktake,
          },
        ]
      : []),
    ...(data.permissions.canCreateIssue
      ? [
          {
            key: "issue",
            href: `${stockBasePath}/consumption`,
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
      back={<AppBackLink href={`${stockBasePath}/on-hand`} />}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel
              title={stockCopy.table.currentStock}
              icon={IconPackageCheck}
              tone={atRisk ? "warning" : "default"}
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

              {data.locations && data.locations.length > 1 ? (
                <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {detailCopy.locationTitle}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {data.locations.map((loc) => {
                      const locUnits = formatStockUnits(
                        loc.qty,
                        data.ingredient.units,
                        formatQty,
                      );
                      const locLabel =
                        loc.locationKind === "kitchen"
                          ? stockCopy.filters.locationKitchen
                          : loc.locationKind === "warehouse"
                            ? stockCopy.filters.locationWarehouse
                            : loc.name;

                      return (
                        <Item
                          key={loc.locationId}
                          variant="outline"
                          size="sm"
                          className="flex items-center justify-between p-2 text-xs"
                        >
                          <span className="font-medium text-foreground">
                            {locLabel}
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-foreground">
                            {locUnits.big ?? locUnits.base}
                          </span>
                        </Item>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </BranchOperatorPanel>

            <BranchOperatorPanel
              title={detailCopy.movementTitle}
              headerHint={detailCopy.movementHint(
                filteredMovements.length,
                data.movements.length,
              )}
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
                <div className="flex min-w-0 flex-col gap-2">
                  <div
                    className="flex flex-wrap gap-1.5 pb-1"
                    role="tablist"
                    aria-label={detailCopy.movementTitle}
                  >
                    {MOVEMENT_CATEGORY_KEYS.map((catKey) => {
                      const isSelected = selectedCategory === catKey;
                      const count = categoryCounts[catKey];
                      return (
                        <Button
                          key={catKey}
                          type="button"
                          size="xs"
                          role="tab"
                          aria-selected={isSelected}
                          variant={isSelected ? "default" : "outline"}
                          onClick={() => {
                            setSelectedCategory(catKey);
                            setIsExpanded(false);
                          }}
                          className="h-7 touch-manipulation rounded-full px-2.5 text-xs font-normal"
                        >
                          <span>{detailCopy.movementCategories[catKey]}</span>
                          <Badge
                            variant={isSelected ? "secondary" : "outline"}
                            className="ml-1 px-1 py-0 font-mono leading-none"
                          >
                            {count}
                          </Badge>
                        </Button>
                      );
                    })}
                  </div>

                  {filteredMovements.length === 0 ? (
                    <AppEmptyState
                      compact
                      mode="no-data"
                      icon={<IconClipboardList />}
                      title={detailCopy.noMovementCategoryTitle}
                      description={detailCopy.noMovementCategoryDescription(
                        detailCopy.movementCategories[selectedCategory],
                      )}
                    >
                      <Button
                        type="button"
                        size="touch"
                        variant="outline"
                        onClick={() => setSelectedCategory("all")}
                      >
                        {detailCopy.clearCategoryFilter}
                      </Button>
                    </AppEmptyState>
                  ) : (
                    <>
                      <ItemGroup className="gap-2" role="list">
                        {visibleMovements.map((movement) => {
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
                          const rawLoc = movement.locationName;
                          const locDisplay =
                            rawLoc === "kitchen" ||
                            movement.locationCode === "kitchen"
                              ? stockCopy.filters.locationKitchen
                              : rawLoc === "warehouse" ||
                                  movement.locationCode === "warehouse"
                                ? stockCopy.filters.locationWarehouse
                                : rawLoc;

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
                                      {locDisplay ? ` · ${locDisplay}` : ""}
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
                                    {referenceLabel && movement.reason
                                      ? " · "
                                      : null}
                                    {movement.reason}
                                  </ItemDescription>
                                ) : null}
                              </Item>
                            </div>
                          );
                        })}
                      </ItemGroup>

                      {filteredMovements.length > INITIAL_VISIBLE_COUNT ? (
                        <div className="pt-1">
                          {!isExpanded ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="touch"
                              onClick={() => setIsExpanded(true)}
                              className="w-full text-xs"
                            >
                              <IconChevronDown data-icon="inline-start" />
                              {detailCopy.showMoreMovements(remainingCount)}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="touch"
                              onClick={() => setIsExpanded(false)}
                              className="w-full text-xs text-muted-foreground"
                            >
                              <IconChevronUp data-icon="inline-start" />
                              {detailCopy.showLessMovements}
                            </Button>
                          )}
                        </div>
                      ) : null}

                      {categoryModule ? (
                        <div className="border-t pt-2 text-center">
                          <Link
                            href={categoryModule.href}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            <span>
                              {detailCopy.openCategoryModule(
                                categoryModule.label,
                              )}
                            </span>
                            <IconExternalLink className="size-3.5" />
                          </Link>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
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

            {secondaryActions.length > 0 ? (
              <div className="hidden sm:block">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="touch"
                        className="w-full"
                        aria-label={stockCopy.actions.actionsDropdown}
                      >
                        <IconMore />
                        {stockCopy.actions.actionsDropdown}
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-56">
                    {secondaryActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <DropdownMenuItem
                          key={action.key}
                          size="touch"
                          render={<Link href={action.href} />}
                        >
                          <Icon />
                          {action.title}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        </div>

        <AppDetailFooter
          sticky
          leading={
            <Button
              size="touch-lg"
              variant="outline"
              className="min-w-0 flex-1"
              render={<Link href={onHandHref} />}
            >
              <IconArrowLeft data-icon="inline-start" />
              {ACTIONS_VI.back}
            </Button>
          }
          trailing={
            primaryActions.length > 1 ? (
              <div className="grid w-full min-w-0 grid-cols-2 gap-2">
                {primaryActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.key}
                      size="touch-lg"
                      className="min-w-0"
                      render={<Link href={action.href} />}
                    >
                      <Icon data-icon="inline-start" />
                      {action.label}
                    </Button>
                  );
                })}
              </div>
            ) : primaryAction ? (
              <Button
                size="touch-lg"
                className="min-w-0 flex-1"
                render={<Link href={primaryAction.href} />}
              >
                {(() => {
                  const Icon = primaryAction.icon;
                  return <Icon data-icon="inline-start" />;
                })()}
                {primaryAction.label}
              </Button>
            ) : undefined
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
