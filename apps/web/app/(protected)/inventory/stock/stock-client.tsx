"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { formatVNDate } from "@comtammatu/shared/time";
import {
  ArrowRightToLine as IconArrowBarRight,
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Receipt as IconReceipt,
  Search as IconSearch,
  ShoppingCart as IconShoppingCart,
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
import { cn } from "@comtammatu/ui";
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
  type StockLocationFilter,
  type StockWorkSummary,
} from "@lib/inventory/stock-on-hand-model";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
  KpiRow,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi/kpi-card";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { formatQty, formatVND } from "../_lib/format";
import { formatStockUnits } from "../_lib/stock-unit-format";
import { CATEGORY_TONE_CLASS, ITEM_KIND_LABELS } from "../_lib/constants";
import type { AdjustStockDialogProps } from "./adjust-stock-dialog";
import type { QuickInternalTransferDialogProps } from "./quick-internal-transfer-dialog";
import type { QuickStockIssueDialogProps } from "./quick-stock-issue-dialog";
import { StockLocationBreakdownLine } from "./stock-location-breakdown";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;

const AdjustStockDialog = dynamic<AdjustStockDialogProps>(
  () => import("./adjust-stock-dialog").then((mod) => mod.AdjustStockDialog),
  { ssr: false },
);

const QuickInternalTransferDialog = dynamic<QuickInternalTransferDialogProps>(
  () =>
    import("./quick-internal-transfer-dialog").then(
      (mod) => mod.QuickInternalTransferDialog,
    ),
  { ssr: false },
);

const QuickStockIssueDialog = dynamic<QuickStockIssueDialogProps>(
  () =>
    import("./quick-stock-issue-dialog").then(
      (mod) => mod.QuickStockIssueDialog,
    ),
  { ssr: false },
);

type QuickIssueType = "consumption" | "writeoff" | "other";
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

const locationFilterOptions: { value: StockLocationFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.allLocations },
  { value: "warehouse", label: stockCopy.filters.locationWarehouse },
  { value: "kitchen", label: stockCopy.filters.locationKitchen },
];

// Two-line stock quantity: largest unit on top (emphasis class from caller),
// base unit muted below. Single-unit ingredients collapse to one line.
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

const STOCK_COMPACT_QUERY = "(max-width: 1023px)";

function subscribeStockCompactLayout(callback: () => void) {
  const media = window.matchMedia(STOCK_COMPACT_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getStockCompactLayoutSnapshot() {
  return window.matchMedia(STOCK_COMPACT_QUERY).matches;
}

function getStockCompactLayoutServerSnapshot() {
  return false;
}

function useStockCompactLayout() {
  return useSyncExternalStore(
    subscribeStockCompactLayout,
    getStockCompactLayoutSnapshot,
    getStockCompactLayoutServerSnapshot,
  );
}

function branchHref(branchId: number, path: string): string {
  return `${path}?branchId=${branchId}`;
}

function stockValue(item: StockIngredient): number {
  return item.qty * item.cost;
}

function StockAlertBadges({
  item,
  className,
}: {
  item: StockIngredient;
  className?: string;
}) {
  const showStatus = item.status !== "normal";
  const showReorder = item.qty <= item.reorder;
  if (!showStatus && !showReorder) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {showStatus ? (
        <StatusBadge domain="inventory" value={item.status} size="sm" />
      ) : null}
      {showReorder ? (
        <Badge variant="warning">{stockCopy.filters.reorder}</Badge>
      ) : null}
    </div>
  );
}

function QuickActionButton({
  href,
  icon: Icon,
  label,
  primary,
  size = "sm",
  className,
}: {
  href: string;
  icon: typeof IconReceipt;
  label: string;
  primary?: boolean;
  size?: "sm" | "touch";
  className?: string;
}) {
  return (
    <Button
      asChild
      size={size}
      variant={primary ? "default" : "outline"}
      className={className}
    >
      <Link href={href}>
        <Icon className="size-3.5" />
        {label}
      </Link>
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
  const isCompactLayout = useStockCompactLayout();
  const [activeCategory, setActiveCategory] = useState(
    STOCK_ALL_CATEGORY_VALUE,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [locationFilter, setLocationFilter] =
    useState<StockLocationFilter>("all");
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );
  const [quickIssueTarget, setQuickIssueTarget] =
    useState<QuickIssueTarget | null>(null);
  const [quickTransferTarget, setQuickTransferTarget] =
    useState<StockIngredient | null>(null);
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);

  const { categories, hasUncategorized } = useMemo(
    () => getStockOnHandCategories(ingredients),
    [ingredients],
  );

  const filters = {
    category: activeCategory,
    location: locationFilter,
    query: searchQuery,
    status: stockFilter,
  } as const;
  const filtered = useMemo(
    () => filterStockOnHandIngredients(ingredients, filters),
    [ingredients, activeCategory, stockFilter, searchQuery, locationFilter],
  );
  const filtersActive = hasStockOnHandFilters(filters);

  // Pristine first-load: ingredients exist in catalog but no GRN has ever
  // happened for this branch. Suppress the 87/87 "Hết hàng" alarm storm
  // (real signal is "no data yet", not "stock-out emergency").
  const isFirstLoadEmpty = !filtersActive && isPristineStockOnHand(ingredients);

  if (coreDataLoadFailed) {
    return (
      <AppPage
        width={isCompactLayout ? "narrow" : "xwide"}
        density="compact"
        scroll
      >
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={stockCopy.title}
        />
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

  const filteredValue = filtered.reduce(
    (sum, item) => sum + stockValue(item),
    0,
  );
  const visibleTotalValue = branchValue ?? filteredValue;
  const liveLabel = formatVNDate(new Date());
  const stockDetailHref = (ingredientId: number) =>
    branchHref(branchId, `/inventory/stock/${ingredientId}`);
  const actionHrefs = {
    receive: branchHref(branchId, "/inventory/grn"),
    transfer: branchHref(branchId, "/inventory/transfers"),
    stocktake: branchHref(branchId, "/inventory/stocktake"),
    waste: branchHref(branchId, "/inventory/waste/new"),
    purchaseSuggestion: branchHref(branchId, "/inventory/purchase-orders/new"),
  };
  const quickIssueBasePath = (issueType: QuickIssueType) =>
    issueType === "consumption"
      ? "/inventory/consumption"
      : "/inventory/issues";
  const actionPermissions = permissions;
  const canReceiveStock = actionPermissions.canReceiveGrn;
  const receiveActionLabel = stockCopy.actions.receiveGrn;
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

    if (actionPermissions.canCreateTransfer) {
      rowActions.push({
        key: "transfer",
        label: stockCopy.actions.transferKitchen,
        icon: <IconArrowBarRight />,
        onSelect: () => setQuickTransferTarget(item),
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
        onSelect: () =>
          setQuickIssueTarget({
            ingredient: item,
            issueType: "writeoff",
          }),
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
  const locationFilterControl = (
    <Select
      value={locationFilter}
      onValueChange={(v) => setLocationFilter(v as StockLocationFilter)}
    >
      <SelectTrigger
        size={isCompactLayout ? "touch" : "default"}
        className={isCompactLayout ? "w-full" : "min-w-32"}
      >
        <SelectValue placeholder={stockCopy.filters.locationPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {locationFilterOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const stockColumns: DataTableColumn<StockIngredient>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      className: "min-w-56",
      render: (item) => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{item.name}</p>
            <StockAlertBadges item={item} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {item.sku || inventoryCommon.noValue}
          </span>
        </div>
      ),
    },
    {
      key: "category",
      header: stockCopy.filters.categoryPlaceholder,
      className: "min-w-32",
      render: (item) =>
        item.category ? (
          <Badge
            className={
              CATEGORY_TONE_CLASS[item.category] ??
              "bg-muted text-muted-foreground"
            }
          >
            {item.category}
          </Badge>
        ) : (
          <span className="text-muted-foreground">
            {inventoryCommon.noValue}
          </span>
        ),
    },
    {
      key: "kind",
      header: stockCopy.table.kind,
      className: "min-w-28",
      render: (item) => (
        <Badge variant="secondary">
          {ITEM_KIND_LABELS[item.itemKind] ?? item.itemKind}
        </Badge>
      ),
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
                "font-semibold text-destructive",
            )}
          />
          <StockLocationBreakdownLine
            rows={item.locationBreakdown}
            className="max-w-40 text-right"
          />
        </div>
      ),
    },
    {
      key: "wac",
      header: stockCopy.table.wac,
      className: "min-w-28 text-right",
      render: (item) => (
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono tabular-nums">
            {item.cost > 0 ? formatVND(item.cost) : inventoryCommon.noValue}
          </span>
          <span className="text-xs text-muted-foreground">₫ / {item.unit}</span>
        </div>
      ),
    },
    {
      key: "value",
      header: stockCopy.table.stockValue,
      className: "min-w-28 text-right",
      render: (item) => (
        <span className="font-mono font-semibold tabular-nums">
          {stockValue(item) > 0
            ? formatVND(stockValue(item))
            : inventoryCommon.noValue}
        </span>
      ),
    },
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

  // Pure-numeric value tiles route through the single-sourced KpiCard.
  const summaryMetrics = (
    <div className="grid grid-cols-2 gap-2">
      <KpiCard
        density="compact"
        label={stockCopy.metrics.selectedWarehouse}
        value={inventoryCommon.currencyCompact(formatVND(visibleTotalValue))}
      />
      {totalValue != null ? (
        <KpiCard
          density="compact"
          label={stockCopy.metrics.wholeSystem}
          value={inventoryCommon.currencyCompact(formatVND(totalValue))}
        />
      ) : null}
    </div>
  );

  // Work signals stay read-only so status filtering has one control.
  const workSignalCluster = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        {stockCopy.metrics.underThreshold}
        <Badge
          variant={summary.underThresholdCount > 0 ? "warning" : "secondary"}
        >
          {summary.underThresholdCount}
        </Badge>
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        {stockCopy.metrics.pending}
        <Badge variant={summary.pendingWorkCount > 0 ? "warning" : "secondary"}>
          {summary.pendingWorkCount}
        </Badge>
      </span>
    </div>
  );

  const searchControl = (
    <InputGroup
      className={cn("w-full min-w-0", !isCompactLayout && "min-w-56 flex-1")}
    >
      <InputGroupAddon>
        <IconSearch />
      </InputGroupAddon>
      <InputGroupInput
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder={stockCopy.filters.searchPlaceholder}
        inputMode="search"
      />
    </InputGroup>
  );

  const filterControls = (
    <>
      <Select value={activeCategory} onValueChange={setActiveCategory}>
        <SelectTrigger
          size={isCompactLayout ? "touch" : "default"}
          className={isCompactLayout ? "w-full" : "min-w-40"}
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
          size={isCompactLayout ? "touch" : "default"}
          className={isCompactLayout ? "w-full" : "min-w-36"}
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

      {locationFilterControl}
    </>
  );

  const resultCountBadge = !isFirstLoadEmpty ? (
    <Badge variant="outline" aria-live="polite">
      {filtered.length}/{ingredients.length}
    </Badge>
  ) : null;

  const primaryReceiveAction = canReceiveStock ? (
    <QuickActionButton
      href={actionHrefs.receive}
      icon={IconReceipt}
      label={receiveActionLabel}
      primary
      size={isCompactLayout ? "touch" : "sm"}
      className={isCompactLayout ? "w-full sm:w-auto" : undefined}
    />
  ) : null;

  const secondaryStockActions = (
    <>
      {actionPermissions.canCreateTransfer ? (
        <QuickActionButton
          href={actionHrefs.transfer}
          icon={IconTruck}
          label={stockCopy.actions.transfer}
          size={isCompactLayout ? "touch" : "sm"}
        />
      ) : null}
      {actionPermissions.canCreateStocktake && actionHrefs.stocktake ? (
        <QuickActionButton
          href={actionHrefs.stocktake}
          icon={IconClipboardList}
          label={stockCopy.actions.stocktake}
          size={isCompactLayout ? "touch" : "sm"}
        />
      ) : null}
      {actionPermissions.canWriteoff ? (
        <QuickActionButton
          href={actionHrefs.waste}
          icon={IconTrash}
          label={stockCopy.actions.waste}
          size={isCompactLayout ? "touch" : "sm"}
        />
      ) : null}
      {actionPermissions.canCreatePurchaseOrder &&
      actionHrefs.purchaseSuggestion ? (
        <QuickActionButton
          href={actionHrefs.purchaseSuggestion}
          icon={IconShoppingCart}
          label={stockCopy.actions.purchaseSuggestion}
          size={isCompactLayout ? "touch" : "sm"}
        />
      ) : null}
    </>
  );

  const hasSecondaryActions =
    actionPermissions.canCreateTransfer ||
    (actionPermissions.canCreateStocktake && actionHrefs.stocktake) ||
    actionPermissions.canWriteoff ||
    (actionPermissions.canCreatePurchaseOrder &&
      actionHrefs.purchaseSuggestion);

  const desktopSecondaryActionsDropdown = hasSecondaryActions ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {stockCopy.actions.actionsDropdown}
          <IconChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {actionPermissions.canCreateTransfer ? (
          <DropdownMenuItem asChild>
            <Link
              href={actionHrefs.transfer}
              className="flex items-center gap-2"
            >
              <IconTruck className="size-4 text-muted-foreground" />
              <span>{stockCopy.actions.transfer}</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
        {actionPermissions.canCreateStocktake && actionHrefs.stocktake ? (
          <DropdownMenuItem asChild>
            <Link
              href={actionHrefs.stocktake}
              className="flex items-center gap-2"
            >
              <IconClipboardList className="size-4 text-muted-foreground" />
              <span>{stockCopy.actions.stocktake}</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
        {actionPermissions.canWriteoff ? (
          <DropdownMenuItem asChild>
            <Link href={actionHrefs.waste} className="flex items-center gap-2">
              <IconTrash className="size-4 text-muted-foreground" />
              <span>{stockCopy.actions.waste}</span>
            </Link>
          </DropdownMenuItem>
        ) : null}
        {actionPermissions.canCreatePurchaseOrder &&
        actionHrefs.purchaseSuggestion ? (
          <DropdownMenuItem asChild>
            <Link
              href={actionHrefs.purchaseSuggestion}
              className="flex items-center gap-2"
            >
              <IconShoppingCart className="size-4 text-muted-foreground" />
              <span>{stockCopy.actions.purchaseSuggestion}</span>
            </Link>
          </DropdownMenuItem>
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
          <div className="flex items-center gap-2">
            {item.category ? (
              <Badge
                className={
                  CATEGORY_TONE_CLASS[item.category] ??
                  "bg-muted text-muted-foreground"
                }
              >
                {item.category}
              </Badge>
            ) : null}
            <Badge variant="secondary">
              {ITEM_KIND_LABELS[item.itemKind] ?? item.itemKind}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {item.sku || inventoryCommon.noValue}
            </span>
          </div>
        </div>
        <StockAlertBadges item={item} className="justify-end" />
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
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            {stockCopy.table.stockValue}
          </p>
          <p className="font-semibold tabular-nums">
            {stockValue(item) > 0
              ? inventoryCommon.currencyCompact(formatVND(stockValue(item)))
              : inventoryCommon.noValue}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {stockCopy.table.wacPerUnit(item.unit)}
          </p>
          <p className="font-mono tabular-nums">
            {item.cost > 0
              ? inventoryCommon.currencyCompact(formatVND(item.cost))
              : inventoryCommon.noValue}
          </p>
        </div>
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
          {actionPermissions.canCreateTransfer ? (
            <Button
              type="button"
              size="touch"
              variant="outline"
              onClick={() => setQuickTransferTarget(item)}
            >
              {stockCopy.actions.transferKitchen}
            </Button>
          ) : null}
          {actionPermissions.canCreateStocktake && actionHrefs.stocktake ? (
            <Button asChild size="touch" variant="outline">
              <Link href={actionHrefs.stocktake}>
                {stockCopy.actions.count}
              </Link>
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

  const content = (
    <>
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={stockCopy.title}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              {liveLabel}
            </Badge>
            <Badge variant="success">Live</Badge>
          </div>
        }
      />
      {!isCompactLayout ? (
        <div className="flex flex-col gap-3">
          <KpiRow density="compact">
            <KpiCard
              density="compact"
              label={stockCopy.metrics.selectedWarehouse}
              value={inventoryCommon.currencyCompact(
                formatVND(visibleTotalValue),
              )}
            />
            {totalValue != null ? (
              <KpiCard
                density="compact"
                label={stockCopy.metrics.wholeSystem}
                value={inventoryCommon.currencyCompact(formatVND(totalValue))}
              />
            ) : null}
          </KpiRow>
        </div>
      ) : null}

      <AppToolbar
        variant="card"
        search={searchControl}
        bulk={
          !isCompactLayout ? (
            <div className="flex flex-wrap items-center gap-2">
              {filterControls}
              {workSignalCluster}
            </div>
          ) : undefined
        }
        actions={
          isCompactLayout ? (
            primaryReceiveAction
          ) : (
            <>
              {primaryReceiveAction}
              {desktopSecondaryActionsDropdown}
            </>
          )
        }
        reset={resultCountBadge}
      />

      {isCompactLayout ? (
        <AppSection
          title={stockCopy.filters.controlsTitle}
          badge={{
            children: `${filtered.length}/${ingredients.length}`,
            variant: "outline",
          }}
          size="sm"
          collapsible
          defaultOpen={false}
        >
          {summaryMetrics}
          {workSignalCluster}
          <div className="grid gap-2 sm:grid-cols-2">{filterControls}</div>
          <div className="flex flex-wrap gap-2">{secondaryStockActions}</div>
        </AppSection>
      ) : null}

      {isFirstLoadEmpty ? (
        <AppEmptyState
          title={stockCopy.empty.firstLoadTitle}
          description={stockCopy.empty.firstLoadHint}
          symbol="riceGrain"
        >
          {actionPermissions.canCreatePurchaseOrder &&
          actionHrefs.purchaseSuggestion ? (
            <Button asChild size="sm">
              <Link href={actionHrefs.purchaseSuggestion}>
                <IconShoppingCart className="size-4" />
                {stockCopy.actions.purchaseSuggestion}
              </Link>
            </Button>
          ) : null}
        </AppEmptyState>
      ) : isCompactLayout ? (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <AppEmptyState
              compact
              title={
                searchQuery.trim()
                  ? stockCopy.empty.search
                  : stockCopy.empty.noData
              }
              description={
                searchQuery.trim()
                  ? stockCopy.empty.searchDescription
                  : stockCopy.empty.noDataDescription
              }
            />
          ) : (
            filtered.map((item) => renderStockMobileCard(item))
          )}
        </div>
      ) : (
        <AppSection className="overflow-hidden" contentFlush>
          <DataTable
            columns={stockColumns}
            data={filtered}
            getRowKey={(item) => item.id}
            emptyTitle={
              searchQuery.trim()
                ? stockCopy.empty.search
                : stockCopy.empty.noData
            }
            emptyDescription={
              searchQuery.trim()
                ? stockCopy.empty.searchDescription
                : stockCopy.empty.noDataDescription
            }
            emptyMode={searchQuery.trim() ? "no-results" : "no-data"}
            renderRowContextMenu={(item) => (
              <RowActionsContextMenuItems items={getStockRowActions(item)} />
            )}
            getRowDataState={(item) =>
              openActionRowId === item.id ? "selected" : undefined
            }
            mobileCardRender={(item) => renderStockMobileCard(item)}
          />
        </AppSection>
      )}

      {adjustTarget ? (
        <AdjustStockDialog
          open={adjustTarget !== null}
          onOpenChange={(open) => {
            if (!open) setAdjustTarget(null);
          }}
          branchId={branchId}
          ingredientId={adjustTarget.id}
          ingredientName={adjustTarget.name}
          unit={adjustTarget.unit}
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

      {quickTransferTarget ? (
        <QuickInternalTransferDialog
          branchId={branchId}
          open={quickTransferTarget !== null}
          target={quickTransferTarget}
          onOpenChange={(open) => {
            if (!open) setQuickTransferTarget(null);
          }}
        />
      ) : null}
    </>
  );

  return (
    <AppPage
      width={isCompactLayout ? "narrow" : "xwide"}
      density="compact"
      scroll
    >
      {content}
    </AppPage>
  );
}
