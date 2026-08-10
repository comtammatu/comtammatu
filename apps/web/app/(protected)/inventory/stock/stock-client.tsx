"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import {
  ArrowRightToLine as IconArrowBarRight,
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Receipt as IconReceipt,
  Search as IconSearch,
  Trash as IconTrash,
  Truck as IconTruck,
  ChevronDown as IconChevronDown,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import { cn } from "@comtammatu/ui";
import { useFormControlSize } from "@/components/form/control-size";
import { messages } from "@lib/messages";
import {
  STOCK_ALL_CATEGORY_VALUE,
  STOCK_NO_CATEGORY_VALUE,
  filterStockOnHandIngredients,
  getStockOnHandCategories,
  hasStockOnHandFilters,
  isPristineStockOnHand,
  type StockActionPermissions,
  type StockFilter,
  type StockIngredient,
  type StockWorkSummary,
} from "@lib/inventory/stock-on-hand-model";
import {
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatQty, formatVND } from "@lib/inventory/format";
import { resolveStockValuationDisplay } from "@lib/inventory/valuation-display";
import {
  formatStockUnits,
  resolveStockDisplayUnit,
  stockUnitLabel,
  toStockDisplayUnitCost,
} from "../_lib/stock-unit-format";
import { CATEGORY_TONE_CLASS, ITEM_KIND_LABELS } from "../_lib/constants";
import type { AdjustStockDialogProps } from "./adjust-stock-dialog";
import type { QuickStockIssueDialogProps } from "./quick-stock-issue-dialog";
import { StockLocationBreakdownLine } from "./stock-location-breakdown";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
const valuationCopy = messages.inventory.valuationDisplay;

function stockWacLabel(
  quantity: number,
  unitCost: number | null | undefined,
  unitLabel: string,
): string {
  const kind = resolveStockValuationDisplay({ quantity, unitCost });
  if (kind === "valued" && unitCost != null) {
    return `${inventoryCommon.currencyCompact(formatVND(unitCost))}/${unitLabel}`;
  }
  if (kind === "pending") return valuationCopy.pendingWac;
  return inventoryCommon.noValue;
}

function stockValueLabel(
  quantity: number,
  unitCost: number | null | undefined,
  value: number | null,
): string {
  const kind = resolveStockValuationDisplay({ quantity, unitCost });
  if (kind === "valued" && value != null) return formatVND(value);
  if (kind === "pending") return valuationCopy.pendingWac;
  return inventoryCommon.noValue;
}

const AdjustStockDialog = dynamic<AdjustStockDialogProps>(
  () => import("./adjust-stock-dialog").then((mod) => mod.AdjustStockDialog),
  { ssr: false },
);

const QuickStockIssueDialog = dynamic<QuickStockIssueDialogProps>(
  () =>
    import("./quick-stock-issue-dialog").then(
      (mod) => mod.QuickStockIssueDialog,
    ),
  { ssr: false },
);

type QuickIssueType = "consumption";
type QuickIssueTarget = {
  ingredient: StockIngredient;
  issueType: QuickIssueType;
};

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.allStatuses },
  { value: "in_stock", label: stockCopy.filters.inStock },
  { value: "low", label: stockCopy.filters.low },
  { value: "out", label: stockCopy.filters.out },
];

function StockQtyCell({
  item,
  className,
}: {
  item: StockIngredient;
  className?: string;
}) {
  const { big, base } = formatStockUnits(item.qty, item.units, formatQty);
  if (big === null) {
    return <span className={className}>{base}</span>;
  }
  return (
    <span className={cn("flex flex-col leading-tight", className)}>
      <span>{big}</span>
      <span className="text-xs font-normal text-muted-foreground">{base}</span>
    </span>
  );
}

function branchHref(branchId: number, path: string): string {
  return `${path}?branchId=${branchId}`;
}

function stockValue(item: StockIngredient): number | null {
  const averageUnitCost = item.monetary?.averageUnitCost;
  return averageUnitCost == null ? null : item.qty * averageUnitCost;
}

function StockItemStatus({
  item,
  className,
}: {
  item: StockIngredient;
  className?: string;
}) {
  return (
    <StatusBadge
      domain="inventory"
      value={item.status}
      size="sm"
      className={className}
    />
  );
}

function StockCategoryKindCell({ item }: { item: StockIngredient }) {
  const kindLabel = ITEM_KIND_LABELS[item.itemKind] ?? UNKNOWN_LABEL_VI;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {item.category ? (
        <Badge
          className={
            CATEGORY_TONE_CLASS[item.category] ??
            "bg-muted text-muted-foreground"
          }
        >
          {item.category}
        </Badge>
      ) : (
        <span className="text-muted-foreground">{inventoryCommon.noValue}</span>
      )}
      <span className="truncate text-xs text-muted-foreground">
        {kindLabel}
      </span>
    </div>
  );
}

function QuickActionButton({
  href,
  icon: Icon,
  label,
  primary,
  size = "field",
  className,
}: {
  href: string;
  icon: typeof IconReceipt;
  label: string;
  primary?: boolean;
  size?: "field" | "touch";
  className?: string;
}) {
  return (
    <Button
      size={size}
      variant={primary ? "default" : "outline"}
      className={className}
      render={<Link href={href} />}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}

export function StockClient({
  ingredients,
  branchId,
  branchValue,
  coreDataLoadFailed,
  totalValue,
  summary,
  permissions,
}: {
  ingredients: StockIngredient[];
  branchId: number;
  branchValue: number | null;
  coreDataLoadFailed: boolean;
  totalValue: number | null;
  summary: StockWorkSummary;
  permissions: StockActionPermissions;
}) {
  const router = useRouter();
  const canViewMonetary = branchValue != null;
  const controlSize = useFormControlSize();
  const [activeCategory, setActiveCategory] = useState(
    STOCK_ALL_CATEGORY_VALUE,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );
  const [quickIssueTarget, setQuickIssueTarget] =
    useState<QuickIssueTarget | null>(null);
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);

  const { categories, hasUncategorized } = useMemo(
    () => getStockOnHandCategories(ingredients),
    [ingredients],
  );

  const filters = {
    categories:
      activeCategory === STOCK_ALL_CATEGORY_VALUE ? [] : [activeCategory],
    query: searchQuery,
    status: stockFilter,
  } as const;
  const filtered = useMemo(
    () => filterStockOnHandIngredients(ingredients, filters),
    [ingredients, activeCategory, stockFilter, searchQuery],
  );
  const filtersActive = hasStockOnHandFilters(filters);

  // Pristine first-load: ingredients exist in catalog but no GRN has ever
  // happened for this branch. Suppress the 87/87 "Hết hàng" alarm storm
  // (real signal is "no data yet", not "stock-out emergency").
  const isFirstLoadEmpty = !filtersActive && isPristineStockOnHand(ingredients);

  if (coreDataLoadFailed) {
    return (
      <AppPage width="xwide" density="compact" scroll>
        <AppPageHeader title={stockCopy.title} />
        <AppEmptyState
          mode="error"
          title={stockCopy.loadFailed}
          description={stockCopy.loadFailedDescription}
        >
          <Button type="button" onClick={() => router.refresh()}>
            {ACTIONS_VI.retry}
          </Button>
        </AppEmptyState>
      </AppPage>
    );
  }

  // Never recompute a money total from row costs when branchValue is denied.
  const visibleTotalValue = branchValue;
  const stockDetailHref = (ingredientId: number) =>
    branchHref(branchId, `/inventory/stock/${ingredientId}`);
  const actionHrefs = {
    request: branchHref(branchId, "/inventory/stock-requests"),
    receive: branchHref(branchId, "/inventory/grn"),
    transfer: branchHref(branchId, "/inventory/transfers"),
    stocktake: branchHref(branchId, "/inventory/stocktake"),
    waste: branchHref(branchId, "/inventory/waste/new"),
  };
  const quickIssueBasePath = (_issueType: QuickIssueType) =>
    "/inventory/consumption";
  const actionPermissions = permissions;
  const canReceiveStock = actionPermissions.canReceiveGrn;
  const getStockRowActions = (item: StockIngredient): RowActionItem[] => {
    const rowActions: RowActionItem[] = [];

    if (actionPermissions.canCreateIssue) {
      rowActions.push({
        key: "issue",
        label: stockCopy.actions.issueStock,
        icon: <IconTruck />,
        onSelect: () =>
          setQuickIssueTarget({
            ingredient: item,
            issueType: "consumption",
          }),
      });
    }

    if (actionPermissions.canCreateStocktake && actionHrefs.stocktake) {
      rowActions.push({
        key: "stocktake",
        label: stockCopy.actions.count,
        icon: <IconClipboardList />,
        href: actionHrefs.stocktake,
      });
    }

    if (actionPermissions.canWriteoff) {
      rowActions.push({
        key: "waste",
        label: stockCopy.actions.waste,
        icon: <IconTrash />,
        destructive: true,
        href: actionHrefs.waste,
      });
    }

    rowActions.push({
      key: "view-stock-card",
      label: stockCopy.actions.viewStockCard,
      icon: <IconArrowBarRight />,
      href: stockDetailHref(item.id),
      separatorBefore: rowActions.length > 0,
    });

    if (actionPermissions.canAdjustException) {
      rowActions.push({
        key: "exception",
        label: stockCopy.actions.exception,
        icon: <IconPencil />,
        destructive: true,
        onSelect: () => setAdjustTarget(item),
      });
    }

    return rowActions;
  };
  const stockColumns: DataTableColumn<StockIngredient>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      className: "min-w-56",
      render: (item) => (
        <div className="flex flex-col gap-1">
          <p>{item.name}</p>
          <span className="font-mono text-xs text-muted-foreground">
            {item.sku || inventoryCommon.noValue}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: stockCopy.table.status,
      className: "min-w-28",
      render: (item) => <StockItemStatus item={item} />,
    },
    {
      key: "category",
      header: stockCopy.table.categoryKind,
      className: "min-w-36",
      render: (item) => <StockCategoryKindCell item={item} />,
    },
    {
      key: "stock",
      header: stockCopy.table.stock,
      className: "min-w-24 text-right",
      render: (item) => (
        <div className="flex flex-col items-end gap-1">
          <StockQtyCell
            item={item}
            className={cn(
              "font-mono tabular-nums",
              (item.status === "low" || item.status === "out") &&
                "text-destructive",
            )}
          />
          <StockLocationBreakdownLine
            rows={item.locationBreakdown}
            className="max-w-40 text-right"
          />
        </div>
      ),
    },
    ...(canViewMonetary
      ? [
          {
            key: "wac",
            header: stockCopy.table.wac,
            className: "min-w-28 text-right",
            render: (item: StockIngredient) => {
              const costUnit = resolveStockDisplayUnit(item.units);
              const displayWac = toStockDisplayUnitCost(
                item.monetary?.averageUnitCost,
                costUnit,
              );
              const unitLabel = stockUnitLabel(costUnit, item.unit);
              const kind = resolveStockValuationDisplay({
                quantity: item.qty,
                unitCost: displayWac,
              });
              return (
                <span
                  className={
                    kind === "pending"
                      ? "text-muted-foreground"
                      : "font-mono tabular-nums"
                  }
                >
                  {stockWacLabel(item.qty, displayWac, unitLabel)}
                </span>
              );
            },
          },
          {
            key: "value",
            header: stockCopy.table.stockValue,
            className: "min-w-28 text-right",
            render: (item: StockIngredient) => {
              const value = stockValue(item);
              const kind = resolveStockValuationDisplay({
                quantity: item.qty,
                unitCost: item.monetary?.averageUnitCost,
              });
              return (
                <span
                  className={
                    kind === "pending"
                      ? "text-muted-foreground"
                      : "font-mono tabular-nums"
                  }
                >
                  {stockValueLabel(
                    item.qty,
                    item.monetary?.averageUnitCost,
                    value,
                  )}
                </span>
              );
            },
          },
        ]
      : []),
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-10 text-right",
      render: (item) => {
        const items = getStockRowActions(item);
        if (items.length === 0) return null;

        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={stockCopy.actions.viewDetailAria(item.name)}
              triggerSize="icon-sm"
              open={openActionRowId === item.id}
              onOpenChange={(open) => setOpenActionRowId(open ? item.id : null)}
            />
          </div>
        );
      },
    },
  ];

  const underThresholdButton = (
    <Button
      type="button"
      variant={stockFilter === "low" ? "secondary" : "outline"}
      size={controlSize}
      className={
        controlSize === "touch" ? undefined : inventoryListFilterSelectClassName
      }
      aria-pressed={stockFilter === "low"}
      onClick={() =>
        setStockFilter((current) => (current === "low" ? "all" : "low"))
      }
    >
      {stockCopy.metrics.underThreshold}
      <Badge
        variant={summary.underThresholdCount > 0 ? "warning" : "secondary"}
      >
        {summary.underThresholdCount}
      </Badge>
    </Button>
  );

  const searchControl = (
    <InputGroup
      size={controlSize}
      className={cn(
        "w-full min-w-0",
        controlSize === "field" && "min-w-56 flex-1",
      )}
    >
      <InputGroupAddon>
        <IconSearch />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={stockCopy.filters.searchPlaceholder}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder={stockCopy.filters.searchPlaceholder}
        inputMode="search"
      />
    </InputGroup>
  );

  const filterControls = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Select value={activeCategory} onValueChange={setActiveCategory}>
        <SelectTrigger
          size={controlSize}
          className={
            controlSize === "touch"
              ? "w-full"
              : inventoryListFilterSelectClassName
          }
        >
          <SelectValue placeholder={stockCopy.filters.categoryPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{stockCopy.filters.allCategories}</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat}
            </SelectItem>
          ))}
          {hasUncategorized ? (
            <SelectItem value={STOCK_NO_CATEGORY_VALUE}>
              {stockCopy.filters.noCategory}
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      <Select
        value={stockFilter}
        onValueChange={(v) => setStockFilter(v as StockFilter)}
      >
        <SelectTrigger
          size={controlSize}
          className={
            controlSize === "touch"
              ? "w-full"
              : inventoryListFilterSelectClassName
          }
        >
          <SelectValue placeholder={stockCopy.filters.statusPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {stockFilterOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const primaryRequestAction = actionPermissions.canCreateStockRequest ? (
    <QuickActionButton
      href={actionHrefs.request}
      icon={IconReceipt}
      label={stockCopy.actions.receiveGrn}
      primary
      size={controlSize}
      className={controlSize === "touch" ? "w-full sm:w-auto" : undefined}
    />
  ) : null;

  const hasSecondaryActions =
    canReceiveStock ||
    (actionPermissions.canCreateStocktake && actionHrefs.stocktake) ||
    actionPermissions.canWriteoff;

  const desktopSecondaryActionsDropdown = hasSecondaryActions ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="field" className="gap-1.5">
            {stockCopy.actions.actionsDropdown}
            <IconChevronDown className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {canReceiveStock ? (
          <DropdownMenuItem
            render={
              <Link
                href={actionHrefs.receive}
                className="flex items-center gap-2"
              >
                <IconTruck className="size-4 text-muted-foreground" />
                <span>{stockCopy.actions.receiveGoods}</span>
              </Link>
            }
          />
        ) : null}
        {actionPermissions.canCreateStocktake && actionHrefs.stocktake ? (
          <DropdownMenuItem
            render={
              <Link
                href={actionHrefs.stocktake}
                className="flex items-center gap-2"
              >
                <IconClipboardList className="size-4 text-muted-foreground" />
                <span>{stockCopy.actions.stocktake}</span>
              </Link>
            }
          />
        ) : null}
        {actionPermissions.canWriteoff ? (
          <DropdownMenuItem
            render={
              <Link
                href={actionHrefs.waste}
                className="flex items-center gap-2"
              >
                <IconTrash className="size-4 text-muted-foreground" />
                <span>{stockCopy.actions.waste}</span>
              </Link>
            }
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const hasItemActions =
    actionPermissions.canCreateIssue ||
    actionPermissions.canCreateTransfer ||
    Boolean(actionPermissions.canCreateStocktake && actionHrefs.stocktake) ||
    actionPermissions.canAdjustException;

  const renderStockMobileCard = (item: StockIngredient) => (
    <InteractiveCard
      key={item.id}
      minHeight="mobile"
      padding="default"
      className="flex-col items-stretch gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={stockDetailHref(item.id)}
            className="truncate font-semibold hover:underline"
          >
            {item.name}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <StockCategoryKindCell item={item} />
            <span className="font-mono text-xs text-muted-foreground">
              {item.sku || inventoryCommon.noValue}
            </span>
          </div>
        </div>
        <StockItemStatus item={item} className="shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">
            {stockCopy.table.availableStock}
          </p>
          <StockQtyCell
            item={item}
            className={cn(
              "font-semibold tabular-nums",
              (item.status === "low" || item.status === "out") &&
                "text-destructive",
            )}
          />
          <StockLocationBreakdownLine
            rows={item.locationBreakdown}
            className="mt-1"
          />
        </div>
        {item.monetary ? (
          <>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {stockCopy.table.stockValue}
              </p>
              <p
                className={
                  resolveStockValuationDisplay({
                    quantity: item.qty,
                    unitCost: item.monetary.averageUnitCost,
                  }) === "pending"
                    ? "text-sm text-muted-foreground"
                    : "font-semibold tabular-nums"
                }
              >
                {(() => {
                  const label = stockValueLabel(
                    item.qty,
                    item.monetary.averageUnitCost,
                    stockValue(item),
                  );
                  return label === inventoryCommon.noValue ||
                    label === valuationCopy.pendingWac
                    ? label
                    : inventoryCommon.currencyCompact(label);
                })()}
              </p>
            </div>
            <div>
              {(() => {
                const costUnit = resolveStockDisplayUnit(item.units);
                const displayWac = toStockDisplayUnitCost(
                  item.monetary.averageUnitCost,
                  costUnit,
                );
                const unitLabel = stockUnitLabel(costUnit, item.unit);
                const kind = resolveStockValuationDisplay({
                  quantity: item.qty,
                  unitCost: displayWac,
                });
                return (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {stockCopy.table.wacPerUnit(unitLabel)}
                    </p>
                    <p
                      className={
                        kind === "pending"
                          ? "text-sm text-muted-foreground"
                          : "font-mono tabular-nums"
                      }
                    >
                      {kind === "valued" && displayWac != null
                        ? inventoryCommon.currencyCompact(formatVND(displayWac))
                        : kind === "pending"
                          ? valuationCopy.pendingWac
                          : inventoryCommon.noValue}
                    </p>
                  </>
                );
              })()}
            </div>
          </>
        ) : null}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            {stockCopy.table.lastCount}
          </p>
          <p>{item.lastCount}</p>
        </div>
      </div>

      {hasItemActions ? (
        <div className="grid grid-cols-2 gap-2 border-t pt-2">
          {actionPermissions.canCreateIssue ? (
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={() =>
                setQuickIssueTarget({
                  ingredient: item,
                  issueType: "consumption",
                })
              }
            >
              {stockCopy.actions.issueStock}
            </Button>
          ) : null}
          {actionPermissions.canCreateStocktake && actionHrefs.stocktake ? (
            <Button
              size="touch"
              variant="outline"
              render={<Link href={actionHrefs.stocktake} />}
            >
              {stockCopy.actions.count}
            </Button>
          ) : null}
          {actionPermissions.canAdjustException ? (
            <Button
              type="button"
              size="touch"
              variant="destructive"
              className="col-span-2"
              onClick={() => setAdjustTarget(item)}
              aria-label={stockCopy.actions.adjustExceptionAria(item.name)}
            >
              <IconPencil />
              {stockCopy.actions.exception}
            </Button>
          ) : null}
        </div>
      ) : null}
    </InteractiveCard>
  );

  const stockToolbar = (
    <AppToolbar
      sticky
      variant="inline"
      search={searchControl}
      filters={
        <>
          {filterControls}
          {underThresholdButton}
        </>
      }
    />
  );

  const content = (
    <>
      <AppPageHeader
        title={stockCopy.title}
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {visibleTotalValue != null ? (
              <span className="inline-flex items-center gap-1.5">
                <span>{stockCopy.metrics.selectedWarehouse}</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {inventoryCommon.currencyCompact(
                    formatVND(visibleTotalValue),
                  )}
                </span>
              </span>
            ) : null}
            {totalValue != null ? (
              <span className="inline-flex items-center gap-1.5">
                <span>{stockCopy.metrics.wholeSystem}</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {inventoryCommon.currencyCompact(formatVND(totalValue))}
                </span>
              </span>
            ) : null}
          </div>
        }
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {desktopSecondaryActionsDropdown}
            {primaryRequestAction}
          </div>
        }
      />

      <AppListFrame
        title={PRODUCT_VI.rawIngredient}
        badge={
          isFirstLoadEmpty
            ? undefined
            : {
                children: `${filtered.length}/${ingredients.length}`,
                variant: "outline",
              }
        }
        toolbar={stockToolbar}
      >
        <DataTable
          columns={stockColumns}
          data={filtered}
          pageSize={25}
          getRowKey={(item) => item.id}
          emptyTitle={
            isFirstLoadEmpty
              ? stockCopy.empty.firstLoadTitle
              : searchQuery.trim()
                ? stockCopy.empty.search
                : stockCopy.empty.noData
          }
          emptyDescription={
            isFirstLoadEmpty
              ? stockCopy.empty.firstLoadHint
              : searchQuery.trim()
                ? stockCopy.empty.searchDescription
                : stockCopy.empty.noDataDescription
          }
          emptyMode={
            isFirstLoadEmpty || !searchQuery.trim() ? "no-data" : "no-results"
          }
          renderRowContextMenu={(item) => (
            <RowActionsContextMenuItems items={getStockRowActions(item)} />
          )}
          getRowDataState={(item) =>
            openActionRowId === item.id ? "selected" : undefined
          }
          mobileCardRender={(item) => renderStockMobileCard(item)}
        />
      </AppListFrame>

      {adjustTarget ? (
        <AdjustStockDialog
          open={adjustTarget !== null}
          onOpenChange={(open) => {
            if (!open) setAdjustTarget(null);
          }}
          branchId={branchId}
          ingredient={adjustTarget}
          onAdjusted={() => {
            setAdjustTarget(null);
            router.refresh();
          }}
        />
      ) : null}

      {quickIssueTarget ? (
        <QuickStockIssueDialog
          key={`${quickIssueTarget.ingredient.id}-${quickIssueTarget.issueType}`}
          branchId={branchId}
          open={quickIssueTarget !== null}
          target={quickIssueTarget}
          issueBasePath={quickIssueBasePath(quickIssueTarget.issueType)}
          onOpenChange={(open) => {
            if (!open) setQuickIssueTarget(null);
          }}
        />
      ) : null}
    </>
  );

  return (
    <AppPage width="xwide" density="compact" scroll>
      {content}
    </AppPage>
  );
}
