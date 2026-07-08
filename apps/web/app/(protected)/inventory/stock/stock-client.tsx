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
import { matchesSearch } from "@lib/search";
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
import type { IngredientUnitRow } from "../_lib/types";
import type { AdjustStockDialogProps } from "./adjust-stock-dialog";
import type { QuickInternalTransferDialogProps } from "./quick-internal-transfer-dialog";
import type { QuickStockIssueDialogProps } from "./quick-stock-issue-dialog";
import {
  STOCK_ALL_CATEGORY_VALUE,
  STOCK_NO_CATEGORY_VALUE,
  StockMobileGrid,
} from "./stock-mobile-grid";
import {
  StockLocationBreakdownLine,
  type StockLocationBreakdown,
} from "./stock-location-breakdown";
import { OperatorFlowSteps } from "../_components/operator-flow-steps";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
const operatorFlow = messages.inventory.operatorFlow;

const AdjustStockDialog = dynamic<AdjustStockDialogProps>(
  () => import("./adjust-stock-dialog").then((mod) => mod.AdjustStockDialog),
  { ssr: false },
);

const QuickInternalTransferDialog =
  dynamic<QuickInternalTransferDialogProps>(
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

export type StockIngredient = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  units?: IngredientUnitRow[];
  category: string;
  itemKind: string;
  qty: number;
  cost: number;
  min: number;
  max: number;
  reorder: number;
  status: "normal" | "low" | "out" | "over";
  lastCount: string;
  temp: string | null;
  locationBreakdown?: StockLocationBreakdown[];
};

export type StockWorkSummary = {
  underThresholdCount: number;
  pendingGrnCount: number;
  pendingTransferCount: number;
  pendingWorkCount: number;
};

export type StockActionPermissions = {
  canReceiveGrn: boolean;
  canReceiveTransfer: boolean;
  canCreateIssue: boolean;
  canCreateTransfer: boolean;
  canCreateStocktake: boolean;
  canWriteoff: boolean;
  canCreatePurchaseOrder: boolean;
  canAdjustException: boolean;
};

type StockFilter = "all" | "in_stock" | "low" | "out";
type LocationFilter = "all" | "warehouse" | "kitchen";
type QuickIssueType = "consumption" | "writeoff" | "other";
type QuickIssueTarget = {
  ingredient: StockIngredient;
  issueType: QuickIssueType;
};

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.all },
  { value: "in_stock", label: stockCopy.filters.inStock },
  { value: "low", label: stockCopy.filters.low },
  { value: "out", label: stockCopy.filters.out },
];

const locationFilterOptions: { value: LocationFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.all },
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

const STATUS_PRIORITY: Record<StockIngredient["status"], number> = {
  out: 0,
  low: 1,
  over: 2,
  normal: 3,
};

const STOCK_COMPACT_QUERY = "(max-width: 1023px)";

function computeStockStatus(
  qty: number,
  min: number,
  max: number,
): StockIngredient["status"] {
  if (qty <= 0) return "out";
  if (qty < min) return "low";
  if (max > 0 && qty > max) return "over";
  return "normal";
}

function locationScopedIngredient(
  ingredient: StockIngredient,
  locationFilter: LocationFilter,
): StockIngredient {
  if (locationFilter === "all") return ingredient;

  const rows =
    ingredient.locationBreakdown?.filter(
      (row) => row.locationKind === locationFilter,
    ) ?? [];
  const qty = rows.reduce((sum, row) => sum + row.qty, 0);
  const costBasis = rows.reduce(
    (sum, row) => sum + row.qty * (row.avgUnitCost ?? 0),
    0,
  );
  const latestCount = rows
    .map((row) => row.lastCountedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    ...ingredient,
    qty,
    cost: qty > 0 ? costBasis / qty : ingredient.cost,
    status: computeStockStatus(qty, ingredient.min, ingredient.max),
    lastCount: latestCount
      ? formatVNDate(latestCount)
      : inventoryCommon.noValue,
    locationBreakdown: rows,
  };
}

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

function branchStockHref(basePath: string, segment: string): string {
  return `${basePath}${segment}`;
}

function stockValue(item: StockIngredient): number {
  return item.qty * item.cost;
}

function isReorderRisk(item: StockIngredient): boolean {
  return (
    item.status === "out" || item.status === "low" || item.qty <= item.reorder
  );
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
  totalValue,
  summary,
  permissions,
  branchStockBasePath,
  embedded = false,
}: {
  ingredients: StockIngredient[];
  branchId: number;
  branchValue: number | null;
  totalValue: number | null;
  summary: StockWorkSummary;
  permissions: StockActionPermissions;
  branchStockBasePath?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const isCompactLayout = useStockCompactLayout();
  const [activeCategory, setActiveCategory] = useState(STOCK_ALL_CATEGORY_VALUE);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );
  const [quickIssueTarget, setQuickIssueTarget] =
    useState<QuickIssueTarget | null>(null);
  const [quickTransferTarget, setQuickTransferTarget] =
    useState<StockIngredient | null>(null);
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);

  const categories = useMemo(() => {
    const values = [
      ...new Set(
        ingredients.map((ingredient) => ingredient.category).filter(Boolean),
      ),
    ];
    values.sort((left, right) => left.localeCompare(right, "vi"));
    return values;
  }, [ingredients]);

  const hasUncategorized = useMemo(
    () => ingredients.some((ingredient) => !ingredient.category),
    [ingredients],
  );

  const filtered = useMemo(() => {
    let result = ingredients.map((ingredient) =>
      locationScopedIngredient(ingredient, locationFilter),
    );

    if (activeCategory === STOCK_NO_CATEGORY_VALUE) {
      result = result.filter((ingredient) => !ingredient.category);
    } else if (activeCategory !== STOCK_ALL_CATEGORY_VALUE) {
      result = result.filter(
        (ingredient) => ingredient.category === activeCategory,
      );
    }

    if (stockFilter === "in_stock") {
      result = result.filter(
        (ingredient) =>
          ingredient.status === "normal" || ingredient.status === "over",
      );
    } else if (stockFilter === "low") {
      result = result.filter(isReorderRisk);
    } else if (stockFilter === "out") {
      result = result.filter((ingredient) => ingredient.status === "out");
    }

    if (searchQuery.trim()) {
      result = result.filter((ingredient) =>
        matchesSearch([ingredient.name, ingredient.sku], searchQuery),
      );
    }

    const sorted = [...result];
    sorted.sort(
      (a, b) =>
        STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
        Number(isReorderRisk(b)) - Number(isReorderRisk(a)) ||
        a.name.localeCompare(b.name, "vi"),
    );

    return sorted;
  }, [ingredients, activeCategory, stockFilter, searchQuery, locationFilter]);

  const filtersActive =
    searchQuery.trim() !== "" ||
    activeCategory !== STOCK_ALL_CATEGORY_VALUE ||
    stockFilter !== "all" ||
    locationFilter !== "all";

  // Pristine first-load: ingredients exist in catalog but no GRN has ever
  // happened for this branch. Suppress the 87/87 "Hết hàng" alarm storm
  // (real signal is "no data yet", not "stock-out emergency").
  const isFirstLoadEmpty =
    !filtersActive &&
    ingredients.length > 0 &&
    ingredients.every(
      (item) =>
        item.qty === 0 &&
        (!item.lastCount || item.lastCount === inventoryCommon.noValue),
    );

  const filteredValue = filtered.reduce(
    (sum, item) => sum + stockValue(item),
    0,
  );
  const visibleTotalValue = branchValue ?? filteredValue;
  const liveLabel = formatVNDate(new Date());
  const stockRootPath = branchStockBasePath ?? `/br/${branchId}/stock`;
  const stockDetailHref = (ingredientId: number) =>
    embedded
      ? branchStockHref(stockRootPath, `/on-hand/${ingredientId}`)
      : branchHref(branchId, `/inventory/stock/${ingredientId}`);
  const actionHrefs = embedded
    ? {
        receive: branchStockHref(stockRootPath, "/receive"),
        transfer: branchStockHref(stockRootPath, "/transfer"),
        stocktake: branchStockHref(stockRootPath, "/stocktake"),
        waste: branchStockHref(stockRootPath, "/waste"),
        purchaseSuggestion: branchStockHref(
          stockRootPath,
          "/purchase-orders/new",
        ),
        reports: branchStockHref(stockRootPath, "/reports"),
      }
    : {
        receive: branchHref(branchId, "/inventory/grn"),
        transfer: branchHref(branchId, "/inventory/transfers"),
        stocktake: branchHref(branchId, "/inventory/stocktake"),
        waste: branchHref(branchId, "/inventory/waste/new"),
        purchaseSuggestion: branchHref(
          branchId,
          "/inventory/purchase-orders/new",
        ),
        reports: branchHref(branchId, "/inventory/reports"),
      };
  const actionPermissions = permissions;
  const canReceiveStock = embedded
    ? actionPermissions.canReceiveTransfer
    : actionPermissions.canReceiveGrn;
  const receiveActionLabel = embedded
    ? stockCopy.actions.receive
    : stockCopy.actions.receiveGrn;
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
      rowActions.push(
        embedded
          ? {
              key: "waste",
              label: stockCopy.actions.waste,
              icon: <IconTrash />,
              href: actionHrefs.waste,
              destructive: true,
            }
          : {
              key: "waste",
              label: stockCopy.actions.waste,
              icon: <IconTrash />,
              destructive: true,
              onSelect: () =>
                setQuickIssueTarget({
                  ingredient: item,
                  issueType: "writeoff",
                }),
            },
      );
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
      onValueChange={(v) => setLocationFilter(v as LocationFilter)}
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
        <span className="font-mono tabular-nums">
          {item.cost > 0 ? formatVND(item.cost) : inventoryCommon.noValue}
        </span>
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

  // Pure-numeric value tiles route through the single-sourced KpiCard
  // (§ Metric Card). Count tiles are work signals, not KPIs — they live in
  // the filter/badge cluster below. Operator surface shows no KPI value tiles
  // (D067 §0 — numbers are badges/work-signals only), so gate to office.
  const summaryMetrics = embedded ? null : (
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
      className={cn(
        "w-full min-w-0",
        embedded && "min-h-12",
        !isCompactLayout && "min-w-56 flex-1",
      )}
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
      {/* Operator category facet is owned by StockMobileGrid chips. */}
      {!embedded ? (
        <Select value={activeCategory} onValueChange={setActiveCategory}>
          <SelectTrigger
            size={isCompactLayout ? "touch" : "default"}
            className={isCompactLayout ? "w-full" : "min-w-40"}
          >
            <SelectValue placeholder={stockCopy.filters.categoryPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {stockCopy.filters.categoryPlaceholder}
            </SelectItem>
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
      ) : null}

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
      size={isCompactLayout || embedded ? "touch" : "sm"}
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
          size={embedded || isCompactLayout ? "touch" : "sm"}
        />
      ) : null}
      {actionPermissions.canCreateStocktake && actionHrefs.stocktake ? (
        <QuickActionButton
          href={actionHrefs.stocktake}
          icon={IconClipboardList}
          label={stockCopy.actions.stocktake}
          size={embedded || isCompactLayout ? "touch" : "sm"}
        />
      ) : null}
      {actionPermissions.canWriteoff ? (
        <QuickActionButton
          href={actionHrefs.waste}
          icon={IconTrash}
          label={stockCopy.actions.waste}
          size={embedded || isCompactLayout ? "touch" : "sm"}
        />
      ) : null}
      {actionPermissions.canCreatePurchaseOrder &&
      actionHrefs.purchaseSuggestion ? (
        <QuickActionButton
          href={actionHrefs.purchaseSuggestion}
          icon={IconShoppingCart}
          label={stockCopy.actions.purchaseSuggestion}
          size={embedded || isCompactLayout ? "touch" : "sm"}
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
        <Button
          variant="outline"
          size={embedded ? "touch" : "sm"}
          className="gap-1.5"
        >
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

  const operatorTaskSection = embedded ? (
    <AppSection
      title={stockCopy.filters.operatorTasksTitle}
      badge={{
        children: String(summary.pendingWorkCount),
        variant: summary.pendingWorkCount > 0 ? "warning" : "secondary",
      }}
      size="sm"
    >
      <OperatorFlowSteps
        title={operatorFlow.stockTitle}
        description={operatorFlow.stockDescription}
        steps={operatorFlow.stockSteps}
        currentStep={1}
      />
      {primaryReceiveAction ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {primaryReceiveAction}
          <div className="flex flex-wrap gap-2">{secondaryStockActions}</div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">{secondaryStockActions}</div>
      )}
      {workSignalCluster}
    </AppSection>
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
          <p className="text-xs text-muted-foreground">{stockCopy.table.wac}</p>
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
              {ACTIONS_VI.export}
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
      {!embedded ? (
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
      ) : null}
      {operatorTaskSection}
      {!embedded && !isCompactLayout ? (
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
        variant={embedded ? "inline" : "card"}
        search={searchControl}
        bulk={
          !embedded && !isCompactLayout ? (
            <div className="flex flex-wrap items-center gap-2">
              {filterControls}
              {workSignalCluster}
            </div>
          ) : undefined
        }
        actions={
          embedded ? undefined : isCompactLayout ? (
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
          {!embedded ? summaryMetrics : null}
          {!embedded ? workSignalCluster : null}
          <div className="grid gap-2 sm:grid-cols-2">{filterControls}</div>
          {!embedded ? (
            <div className="flex flex-wrap gap-2">{secondaryStockActions}</div>
          ) : null}
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
            <Button asChild size={embedded ? "touch" : "sm"}>
              <Link href={actionHrefs.purchaseSuggestion}>
                <IconShoppingCart className="size-4" />
                {stockCopy.actions.purchaseSuggestion}
              </Link>
            </Button>
          ) : null}
        </AppEmptyState>
      ) : isCompactLayout ? (
        embedded ? (
          <StockMobileGrid
            ingredients={filtered}
            categories={categories}
            hasUncategorized={hasUncategorized}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            stockDetailHref={stockDetailHref}
          />
        ) : (
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
        )
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
          issueBasePath={
            embedded
              ? branchStockHref(stockRootPath, "/issues")
              : "/inventory/issues"
          }
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

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

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
