"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useDeferredValue, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import {
  ArrowRightToLine as IconArrowBarRight,
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Receipt as IconReceipt,
  Search as IconSearch,
  Trash as IconTrash,
  Truck as IconTruck,
  ChevronDown as IconChevronDown,
  Sparkles as IconSparkles,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import { useFormControlSize } from "@/components/form/control-size";
import { messages } from "@lib/messages";
import {
  STOCK_ALL_CATEGORY_VALUE,
  STOCK_NO_CATEGORY_VALUE,
  filterStockOnHandIngredients,
  getStockOnHandCategories,
  hasStockOnHandFilters,
  isPristineStockOnHand,
  projectStockIngredientsForLocation,
  type StockActionPermissions,
  type StockFilter,
  type StockIngredient,
  type StockLocationOption,
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
  resolveStockCompactUnit,
  stockUnitLabel,
  toStockDisplayUnitCost,
} from "../_lib/stock-unit-format";
import { CATEGORY_TONE_CLASS, ITEM_KIND_LABELS } from "../_lib/constants";
import { StockLocationBreakdownLine } from "./stock-location-breakdown";
import type { AdjustStockDialogProps } from "./adjust-stock-dialog";
import type { QuickStockIssueDialogProps } from "./quick-stock-issue-dialog";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  fetchCategoryOptions,
  fetchIngredients,
  fetchUnitOptions,
} from "../ingredient-actions";
import { fetchStockIngredientDetailAction } from "../stock-actions";
import type { StockIngredientDetailData } from "@lib/inventory/stock-on-hand-detail-model";
import type { CompanyWacTarget } from "./company-wac-dialog";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@lib/inventory/types";

import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import { BranchStockThresholdsDialog } from "@/components/inventory/branch-stock-thresholds-dialog";
import { SmartReorderSheet } from "@/components/inventory/smart-reorder-sheet";
import { StockOnHandPrintDialog } from "@/components/inventory/stock-on-hand-print-dialog";
import { IntraSiteTransferDialog } from "@/components/inventory/intra-site-transfer-dialog";
import type { BranchStockThresholdRow } from "@lib/inventory/branch-thresholds-data";
import type { IntraSiteTransferData } from "@lib/inventory/intra-site-transfer-data";
import type { ReorderSuggestionItem } from "@lib/inventory/smart-reorder-data";

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
    return `${inventoryCommon.currencyCompact(formatVND(Math.round(unitCost)))}/${unitLabel}`;
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
  if (kind === "valued" && value != null) return formatVND(Math.round(value));
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

const IngredientDialog = dynamic(
  () =>
    import("../ingredients/ingredient-dialog").then(
      (mod) => mod.IngredientDialog,
    ),
  { ssr: false },
);

const StockDetailDialog = dynamic(
  () => import("./stock-detail-dialog").then((mod) => mod.StockDetailDialog),
  { ssr: false },
);

const CompanyWacDialog = dynamic(
  () => import("./company-wac-dialog").then((mod) => mod.CompanyWacDialog),
  { ssr: false },
);

type QuickIssueType = "consumption";
type QuickIssueTarget = {
  ingredient: StockIngredient;
  issueType: QuickIssueType;
};

type EditIngredientTarget = {
  ingredient: IngredientRow;
  unitOptions: UnitOption[];
  categoryOptions: CategoryOption[];
};

const _stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.allStatuses },
  { value: "in_stock", label: stockCopy.filters.inStock },
  { value: "low", label: stockCopy.filters.low },
  { value: "out", label: stockCopy.filters.out },
];

function StockQtyCell({
  item,
  className,
  showBreakdown = false,
}: {
  item: StockIngredient;
  className?: string;
  showBreakdown?: boolean;
}) {
  const { big, base } = formatStockUnits(item.qty, item.units, formatQty);
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={cn("flex flex-col items-end leading-tight", className)}>
        {big === null ? (
          <span>{base}</span>
        ) : (
          <>
            <span>{big}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {base}
            </span>
          </>
        )}
      </span>
      {showBreakdown && item.locationBreakdown ? (
        <StockLocationBreakdownLine
          rows={item.locationBreakdown}
          className="text-right"
        />
      ) : null}
    </div>
  );
}

function branchHref(branchId: number, path: string): string {
  return withControlSurfaceBranchScope(path, String(branchId) as `${number}`, {
    prefixes: ["/inventory"],
  });
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
  ingredients: allIngredients,
  locations,
  defaultLocationId,
  branchId,
  branchValue,
  coreDataLoadFailed,
  totalValue,
  summary: _summary,
  permissions,
  initialIngredientId = null,
  initialDetailData = null,
  branchThresholds = [],
  reorderSuggestions = [],
  intraSiteTransferData = null,
}: {
  ingredients: StockIngredient[];
  locations: StockLocationOption[];
  defaultLocationId: number | null;
  branchId: number;
  branchValue: number | null;
  coreDataLoadFailed: boolean;
  totalValue: number | null;
  summary: StockWorkSummary;
  permissions: StockActionPermissions;
  initialIngredientId?: number | null;
  initialDetailData?: StockIngredientDetailData | null;
  branchThresholds?: BranchStockThresholdRow[];
  reorderSuggestions?: ReorderSuggestionItem[];
  intraSiteTransferData?: IntraSiteTransferData | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canViewMonetary = branchValue != null;
  const controlSize = useFormControlSize();
  const [activeCategory, setActiveCategory] = useState(
    STOCK_ALL_CATEGORY_VALUE,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const selectedLocation =
    defaultLocationId == null ? "total" : String(defaultLocationId);
  function changeLocation(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("location", value);
    params.delete("ingredientId");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const ingredients = useMemo(
    () =>
      projectStockIngredientsForLocation(
        allIngredients,
        selectedLocation === "total" ? null : Number(selectedLocation),
      ),
    [allIngredients, selectedLocation],
  );
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );
  const [quickIssueTarget, setQuickIssueTarget] =
    useState<QuickIssueTarget | null>(null);
  const [editIngredientTarget, setEditIngredientTarget] =
    useState<EditIngredientTarget | null>(null);
  const [companyWacTarget, setCompanyWacTarget] =
    useState<CompanyWacTarget | null>(null);
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const [viewingIngredientId, setViewingIngredientId] = useState<number | null>(
    initialIngredientId,
  );
  const [detailData, setDetailData] =
    useState<StockIngredientDetailData | null>(initialDetailData);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const viewingIngredient =
    viewingIngredientId != null
      ? (ingredients.find((item) => item.id === viewingIngredientId) ?? null)
      : null;

  const secondaryOverlayOpen =
    adjustTarget != null ||
    quickIssueTarget != null ||
    editIngredientTarget != null ||
    companyWacTarget != null;

  const refreshStockDetail = async (ingredientId: number) => {
    const res = await fetchStockIngredientDetailAction({
      ingredientId,
      branchId,
    });
    if (res.success && res.data) {
      setDetailData(res.data);
    }
  };

  const openStockDetail = (ingredientId: number) => {
    setViewingIngredientId(ingredientId);
    const url = new URL(window.location.href);
    url.searchParams.set("ingredientId", String(ingredientId));
    url.searchParams.set("mode", "view");
    window.history.pushState(null, "", url.toString());

    if (detailData?.ingredient?.id !== ingredientId) {
      setIsDetailLoading(true);
      void refreshStockDetail(ingredientId).finally(() => {
        setIsDetailLoading(false);
      });
    }
  };

  const closeStockDetail = () => {
    setViewingIngredientId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("ingredientId");
    url.searchParams.delete("mode");
    window.history.pushState(null, "", url.toString());
  };

  const openEditIngredient = async (ingredientId: number) => {
    const [ingredientsResult, unitsResult, categoriesResult] =
      await Promise.all([
        fetchIngredients(),
        fetchUnitOptions(),
        fetchCategoryOptions(),
      ]);
    if (
      !ingredientsResult.success ||
      !unitsResult.success ||
      !categoriesResult.success
    ) {
      toast.error(messages.inventory.ingredients.list.loadFailed);
      return;
    }
    const ingredient = (
      ingredientsResult.data as IngredientRow[] | undefined
    )?.find((row) => row.id === ingredientId);
    if (!ingredient) {
      toast.error(messages.inventory.ingredients.list.loadFailed);
      return;
    }
    setEditIngredientTarget({
      ingredient,
      unitOptions: unitsResult.data ?? [],
      categoryOptions: categoriesResult.data ?? [],
    });
  };

  const openEditIngredientFromDetail = () => {
    if (viewingIngredientId == null) return;
    void openEditIngredient(viewingIngredientId);
  };

  const { categories, hasUncategorized } = useMemo(
    () => getStockOnHandCategories(ingredients),
    [ingredients],
  );

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filters = {
    categories:
      activeCategory === STOCK_ALL_CATEGORY_VALUE ? [] : [activeCategory],
    query: deferredSearchQuery,
    status: stockFilter,
  } as const;
  const filtered = useMemo(
    () => filterStockOnHandIngredients(ingredients, filters),
    [ingredients, activeCategory, stockFilter, deferredSearchQuery],
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
    const isLowOrOut = item.status === "low" || item.status === "out";

    if (isLowOrOut && actionPermissions.canManagePurchaseRequest) {
      rowActions.push({
        key: "reorder-po",
        label: "Đặt mua hàng",
        icon: <IconPlus />,
        href: branchHref(
          branchId,
          `/inventory/purchase-orders?ingredientId=${item.id}&mode=create`,
        ),
      });
    } else if (isLowOrOut && actionPermissions.canCreateStockRequest) {
      rowActions.push({
        key: "reorder-request",
        label: "Xin hàng",
        icon: <IconPlus />,
        href: branchHref(
          branchId,
          `/inventory/stock-requests/new?ingredientId=${item.id}`,
        ),
      });
    }

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

    if (actionPermissions.canEditIngredient) {
      rowActions.push({
        key: "edit-ingredient",
        label: stockCopy.actions.edit,
        icon: <IconPencil />,
        onSelect: () => void openEditIngredient(item.id),
      });
    }

    rowActions.push({
      key: "view-stock-card",
      label: stockCopy.actions.viewStockCard,
      icon: <IconArrowBarRight />,
      href: stockDetailHref(item.id),
      onSelect: () => openStockDetail(item.id),
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
      className: "min-w-48 w-full",
      sortable: true,
      sortValue: (item) => item.name,
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
      className: "w-28 whitespace-nowrap",
      sortable: true,
      sortValue: (item) => item.status,
      render: (item) => <StockItemStatus item={item} />,
    },
    {
      key: "category",
      header: stockCopy.table.categoryKind,
      className: "w-36 whitespace-nowrap",
      sortable: true,
      sortValue: (item) => item.category ?? "",
      render: (item) => <StockCategoryKindCell item={item} />,
    },
    {
      key: "stock",
      header: stockCopy.table.stock,
      className: "w-36 whitespace-nowrap text-right",
      sortable: true,
      sortValue: (item) => item.qty,
      render: (item) => (
        <StockQtyCell
          item={item}
          showBreakdown={selectedLocation === "total"}
          className={cn(
            "font-mono tabular-nums",
            (item.status === "low" || item.status === "out") &&
              "text-destructive",
          )}
        />
      ),
    },
    ...(canViewMonetary
      ? [
          {
            key: "wac",
            header: stockCopy.table.wac,
            className: "w-40 whitespace-nowrap text-right",
            sortable: true,
            sortValue: (item: StockIngredient) =>
              item.monetary?.averageUnitCost ?? 0,
            render: (item: StockIngredient) => {
              const costUnit = resolveStockCompactUnit(item.qty, item.units);
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
            className: "w-36 whitespace-nowrap text-right",
            sortable: true,
            sortValue: (item: StockIngredient) => stockValue(item) ?? 0,
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
      {locations.length > 1 ? (
        <Select value={selectedLocation} onValueChange={changeLocation}>
          <SelectTrigger
            size={controlSize}
            className={
              controlSize === "touch"
                ? "w-full"
                : inventoryListFilterSelectClassName
            }
            aria-label={stockCopy.filters.locationFilterLabel}
          >
            <SelectValue placeholder={stockCopy.filters.locationFilterLabel} />
          </SelectTrigger>
          <SelectContent>
            {locations.map((location) => (
              <SelectItem key={location.id} value={String(location.id)}>
                {location.kind === "kitchen"
                  ? stockCopy.filters.locationKitchen
                  : location.kind === "warehouse"
                    ? stockCopy.filters.locationWarehouse
                    : location.name}
              </SelectItem>
            ))}
            <SelectItem value="total">
              {stockCopy.filters.locationTotal}
            </SelectItem>
          </SelectContent>
        </Select>
      ) : null}
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
    </div>
  );

  const primaryRequestAction = actionPermissions.canCreateStockRequest ? (
    <QuickActionButton
      href={actionHrefs.request}
      icon={IconReceipt}
      label={stockCopy.actions.receiveGrn}
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
    actionPermissions.canEditIngredient ||
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
            onClick={(e) => {
              e.preventDefault();
              openStockDetail(item.id);
            }}
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
            showBreakdown={selectedLocation === "total"}
            className={cn(
              "font-semibold tabular-nums",
              (item.status === "low" || item.status === "out") &&
                "text-destructive",
            )}
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
                const costUnit = resolveStockCompactUnit(item.qty, item.units);
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
          {actionPermissions.canEditIngredient ? (
            <Button
              type="button"
              size={controlSize === "touch" ? "default" : "sm"}
              variant="outline"
              onClick={() => void openEditIngredient(item.id)}
            >
              <IconPencil />
              {stockCopy.actions.edit}
            </Button>
          ) : null}
          {actionPermissions.canCreateIssue ? (
            <Button
              type="button"
              size={controlSize === "touch" ? "default" : "sm"}
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
              size={controlSize === "touch" ? "default" : "sm"}
              variant="outline"
              render={<Link href={actionHrefs.stocktake} />}
            >
              {stockCopy.actions.count}
            </Button>
          ) : null}
          {actionPermissions.canAdjustException ? (
            <Button
              type="button"
              size={controlSize === "touch" ? "default" : "sm"}
              variant="destructive"
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

  const totalCount = ingredients.length;
  const inStockCount = ingredients.filter((i) => i.status === "normal").length;
  const lowStockCount = ingredients.filter((i) => i.status === "low").length;
  const outOfStockCount = ingredients.filter((i) => i.status === "out").length;
  const shortageCount = reorderSuggestions.filter((i) => i.isBelowMin).length;

  const hasValuation = visibleTotalValue != null || totalValue != null;
  const selectedLocationObj = locations.find(
    (l) => String(l.id) === selectedLocation,
  );
  const valuationMetricTitle =
    selectedLocation === "total"
      ? stockCopy.metrics.selectedTotal
      : selectedLocationObj?.kind === "kitchen"
        ? stockCopy.metrics.selectedKitchen
        : stockCopy.metrics.selectedWarehouse;
  const selectedLocationLabel =
    selectedLocationObj?.kind === "kitchen"
      ? stockCopy.filters.locationKitchen
      : selectedLocationObj?.kind === "warehouse"
        ? stockCopy.filters.locationWarehouse
        : null;
  const visibleLocationValue = useMemo(() => {
    if (visibleTotalValue == null) return null;
    if (selectedLocation === "total") return visibleTotalValue;
    return ingredients.reduce((sum, item) => {
      const val = stockValue(item);
      return sum + (val ?? 0);
    }, 0);
  }, [visibleTotalValue, selectedLocation, ingredients]);

  const underThresholdButton = (
    <Item
      variant="outline"
      render={
        <button
          type="button"
          aria-pressed={stockFilter === "low"}
          onClick={() =>
            setStockFilter((cur) => (cur === "low" ? "all" : "low"))
          }
        />
      }
      className={cn(
        "flex flex-col justify-between p-3 text-left cursor-pointer",
        stockFilter === "low"
          ? "border-warning ring-1 ring-warning shadow-xs"
          : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{stockCopy.metrics.lowStock}</span>
        <span className="size-2 rounded-full bg-warning" />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-warning">
          {formatQty(lowStockCount)}
        </span>
        <span className="text-xs text-muted-foreground">
          {stockCopy.metrics.lowStockHint}
        </span>
      </div>
    </Item>
  );

  const content = (
    <>
      <AppPageHeader
        title={stockCopy.title}
        actions={
          <div className="flex w-full flex-wrap items-center justify-start gap-1.5 sm:w-auto sm:justify-end sm:gap-2">
            {selectedLocationObj ? (
              <SmartReorderSheet
                branchId={branchId}
                items={reorderSuggestions}
                trigger={
                  <Button
                    variant="default"
                    size="field"
                    className="w-full gap-1.5 font-medium shadow-xs sm:w-auto"
                  >
                    <IconSparkles className="size-4" />
                    <span>{INVENTORY_VI.smartReorderOpenBtn}</span>
                    {shortageCount > 0 ? (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 px-1.5 font-mono text-xs font-semibold bg-background text-foreground"
                      >
                        {shortageCount}
                      </Badge>
                    ) : null}
                  </Button>
                }
              />
            ) : null}
            {intraSiteTransferData ? (
              <IntraSiteTransferDialog data={intraSiteTransferData} />
            ) : null}
            {selectedLocationObj && selectedLocationLabel ? (
              <BranchStockThresholdsDialog
                key={selectedLocationObj.id}
                branchId={branchId}
                locationId={selectedLocationObj.id}
                locationLabel={selectedLocationLabel}
                initialRows={branchThresholds}
              />
            ) : null}
            <StockOnHandPrintDialog
              branchId={branchId}
              ingredients={filtered}
              buttonSize="field"
              buttonVariant="outline"
            />
            {desktopSecondaryActionsDropdown}
            {primaryRequestAction}
          </div>
        }
      />

      <div
        className={cn(
          "grid gap-3",
          hasValuation
            ? "grid-cols-2 lg:grid-cols-5"
            : "grid-cols-2 lg:grid-cols-4",
        )}
      >
        {hasValuation ? (
          <Item
            variant="outline"
            className="col-span-2 flex flex-col justify-between p-3 text-left border-border bg-card lg:col-span-1"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{valuationMetricTitle}</span>
              <IconReceipt className="size-3.5 text-muted-foreground" />
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {visibleLocationValue != null
                  ? formatVND(Math.round(visibleLocationValue))
                  : "—"}
              </span>
              {totalValue != null ? (
                <span className="text-xs text-muted-foreground font-mono tabular-nums truncate">
                  {stockCopy.metrics.wholeSystem}:{" "}
                  {formatVND(Math.round(totalValue))}
                </span>
              ) : null}
            </div>
          </Item>
        ) : null}

        <Item
          variant="outline"
          render={
            <button
              type="button"
              aria-pressed={stockFilter === "all"}
              onClick={() => setStockFilter("all")}
            />
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            stockFilter === "all"
              ? "border-primary ring-1 ring-primary shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{stockCopy.metrics.totalItems}</span>
            <span className="size-2 rounded-full bg-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatQty(totalCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {stockCopy.metrics.totalItemsUnit}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          render={
            <button
              type="button"
              aria-pressed={stockFilter === "in_stock"}
              onClick={() =>
                setStockFilter((cur) =>
                  cur === "in_stock" ? "all" : "in_stock",
                )
              }
            />
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            stockFilter === "in_stock"
              ? "border-success ring-1 ring-success shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{stockCopy.metrics.inStock}</span>
            <span className="size-2 rounded-full bg-success" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-success">
              {formatQty(inStockCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {stockCopy.metrics.inStockHint}
            </span>
          </div>
        </Item>

        {underThresholdButton}

        <Item
          variant="outline"
          render={
            <button
              type="button"
              aria-pressed={stockFilter === "out"}
              onClick={() =>
                setStockFilter((cur) => (cur === "out" ? "all" : "out"))
              }
            />
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            stockFilter === "out"
              ? "border-destructive ring-1 ring-destructive shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>{stockCopy.metrics.outOfStock}</span>
            <span className="size-2 rounded-full bg-destructive" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-destructive">
              {formatQty(outOfStockCount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {stockCopy.metrics.outOfStockHint}
            </span>
          </div>
        </Item>
      </div>

      <AppListFrame
        toolbar={
          <AppToolbar
            variant="inline"
            search={searchControl}
            filters={<>{filterControls}</>}
            actions={
              isFirstLoadEmpty ? undefined : (
                <Badge variant="outline">
                  {filtered.length}/{ingredients.length}
                </Badge>
              )
            }
          />
        }
      >
        <DataTable
          className="[&_table]:table-fixed"
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
          onRowClick={(item) => openStockDetail(item.id)}
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
            const ingredientId = adjustTarget.id;
            setAdjustTarget(null);
            router.refresh();
            if (viewingIngredientId === ingredientId) {
              void refreshStockDetail(ingredientId);
            }
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

      {editIngredientTarget ? (
        <IngredientDialog
          open={editIngredientTarget !== null}
          onOpenChange={(open) => {
            if (!open) setEditIngredientTarget(null);
          }}
          ingredient={editIngredientTarget.ingredient}
          unitOptions={editIngredientTarget.unitOptions}
          categoryOptions={editIngredientTarget.categoryOptions}
          onSaved={async () => {
            const ingredientId = editIngredientTarget.ingredient.id;
            router.refresh();
            if (viewingIngredientId === ingredientId) {
              await refreshStockDetail(ingredientId);
            }
          }}
        />
      ) : null}

      {companyWacTarget ? (
        <CompanyWacDialog
          target={companyWacTarget}
          onClose={() => setCompanyWacTarget(null)}
          onSaved={() => {
            const ingredientId = companyWacTarget.ingredientId;
            router.refresh();
            if (viewingIngredientId === ingredientId) {
              void refreshStockDetail(ingredientId);
            }
          }}
        />
      ) : null}

      <StockDetailDialog
        open={viewingIngredientId !== null && !secondaryOverlayOpen}
        onOpenChange={(open) => {
          if (!open) closeStockDetail();
        }}
        detailData={detailData}
        isLoading={isDetailLoading}
        isTouchLayout={controlSize === "touch"}
        reorderHref={
          viewingIngredient != null &&
          (viewingIngredient.status === "low" ||
            viewingIngredient.status === "out")
            ? permissions.canManagePurchaseRequest
              ? branchHref(
                  branchId,
                  `/inventory/purchase-orders?ingredientId=${viewingIngredientId}&mode=create`,
                )
              : permissions.canCreateStockRequest
                ? branchHref(
                    branchId,
                    `/inventory/stock-requests/new?ingredientId=${viewingIngredientId}`,
                  )
                : undefined
            : undefined
        }
        reorderLabel={
          viewingIngredient != null &&
          (viewingIngredient.status === "low" ||
            viewingIngredient.status === "out")
            ? permissions.canManagePurchaseRequest
              ? "Đặt mua hàng"
              : permissions.canCreateStockRequest
                ? "Xin hàng"
                : undefined
            : undefined
        }
        canAdjustStock={permissions.canAdjustException}
        canEditIngredient={permissions.canEditIngredient}
        canSetCompanyWac={
          permissions.canSetCompanyWac &&
          ingredients.find((item) => item.id === viewingIngredientId)
            ?.itemKind === "raw_material"
        }
        onEditIngredient={() => {
          void openEditIngredientFromDetail();
        }}
        onSetCompanyWac={() => {
          const target = ingredients.find((i) => i.id === viewingIngredientId);
          if (!target || target.itemKind !== "raw_material") return;
          setCompanyWacTarget({
            ingredientId: target.id,
            name: target.name,
            units: target.units ?? [],
            currentWac:
              detailData?.valuation?.wac ??
              target.monetary?.averageUnitCost ??
              null,
          });
        }}
        onAdjustStock={() => {
          const target = ingredients.find((i) => i.id === viewingIngredientId);
          if (target) setAdjustTarget(target);
        }}
        onQuickIssue={() => {
          const target = ingredients.find((i) => i.id === viewingIngredientId);
          if (target) {
            setQuickIssueTarget({
              ingredient: target,
              issueType: "consumption",
            });
          }
        }}
      />
    </>
  );

  return (
    <AppPage width="xwide" density="compact" scroll>
      {content}
    </AppPage>
  );
}
