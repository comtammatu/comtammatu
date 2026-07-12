"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  ClipboardCheck as IconClipboardCheck,
  ListFilter as IconFilter,
  RotateCcw as IconReset,
  Search as IconSearch,
  Truck as IconTruck,
  Trash2 as IconTrash,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { AppEmptyState } from "@/components/surface";
import { formatQty } from "@/(protected)/inventory/_lib/format";
import { formatStockUnits } from "@/(protected)/inventory/_lib/stock-unit-format";
import { ITEM_KIND_LABELS } from "@/(protected)/inventory/_lib/constants";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  STOCK_ALL_CATEGORY_VALUE,
  STOCK_NO_CATEGORY_VALUE,
  filterStockOnHandIngredients,
  getStockOnHandCategories,
  hasStockOnHandFilters,
  isPristineStockOnHand,
  isStockReorderRisk,
  type StockFilter,
  type StockIngredient,
  type StockLocationFilter,
} from "@lib/inventory/stock-on-hand-model";
import { messages } from "@lib/messages";

const stockCopy = messages.inventory.stock;
const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.allStatuses },
  { value: "in_stock", label: stockCopy.filters.inStock },
  { value: "low", label: stockCopy.filters.low },
  { value: "out", label: stockCopy.filters.out },
];

const locationFilterOptions: {
  value: StockLocationFilter;
  label: string;
}[] = [
  { value: "all", label: stockCopy.filters.allLocations },
  { value: "warehouse", label: stockCopy.filters.locationWarehouse },
  { value: "kitchen", label: stockCopy.filters.locationKitchen },
];

type StockFilterParam = "category" | "location" | "q" | "status";

function parseStockFilter(value: string | null): StockFilter {
  return stockFilterOptions.some((option) => option.value === value)
    ? (value as StockFilter)
    : "all";
}

function parseLocationFilter(value: string | null): StockLocationFilter {
  return locationFilterOptions.some((option) => option.value === value)
    ? (value as StockLocationFilter)
    : "all";
}

function StockQuantity({ item }: { item: StockIngredient }) {
  const { base } = formatStockUnits(item.qty, item.units, formatQty);
  const atRisk = isStockReorderRisk(item);

  return (
    <div className="min-w-0 text-right">
      <p
        className={cn(
          "font-mono text-base font-semibold leading-5 tabular-nums",
          atRisk ? "text-destructive" : "text-foreground",
        )}
      >
        {base}
      </p>
    </div>
  );
}

function StockRiskBadge({ item }: { item: StockIngredient }) {
  if (item.status === "out") {
    return <Badge variant="destructive">{stockCopy.filters.out}</Badge>;
  }

  if (item.status === "low") {
    return <Badge variant="warning">{stockCopy.filters.low}</Badge>;
  }

  if (isStockReorderRisk(item)) {
    return <Badge variant="warning">{stockCopy.filters.reorder}</Badge>;
  }

  return null;
}

function StockTouchRow({
  branchId,
  item,
  returnTo,
}: {
  branchId: number;
  item: StockIngredient;
  returnTo: string;
}) {
  return (
    <Item
      asChild
      variant="outline"
      size="sm"
      className="min-h-16 touch-manipulation gap-3 px-3 py-2.5"
    >
      <Link
        href={`/br/${branchId}/stock/on-hand/${item.id}?returnTo=${encodeURIComponent(returnTo)}`}
        aria-label={stockCopy.actions.viewDetailAria(item.name)}
        role="listitem"
      >
        <ItemContent className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <ItemTitle size="heading" className="min-w-0 flex-1">
              {item.name}
            </ItemTitle>
            <StockRiskBadge item={item} />
          </div>
          <ItemDescription>
            {[ITEM_KIND_LABELS[item.itemKind] ?? item.itemKind, item.sku]
              .filter(Boolean)
              .join(" · ")}
          </ItemDescription>
        </ItemContent>

        <ItemActions className="min-w-0 justify-end">
          <StockQuantity item={item} />
          <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </ItemActions>
      </Link>
    </Item>
  );
}

interface BranchStockOnHandClientProps {
  branchId: number;
  canCreateGrn: boolean;
  canCreateStocktake: boolean;
  canWriteoff: boolean;
  coreDataLoadFailed: boolean;
  ingredients: StockIngredient[];
  underThresholdCount: number;
}

export function BranchStockOnHandClient({
  branchId,
  canCreateGrn,
  canCreateStocktake,
  canWriteoff,
  coreDataLoadFailed,
  ingredients,
  underThresholdCount,
}: BranchStockOnHandClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? STOCK_ALL_CATEGORY_VALUE;
  const status = parseStockFilter(searchParams.get("status"));
  const location = parseLocationFilter(searchParams.get("location"));
  const [filtersOpen, setFiltersOpen] = useState(
    category !== STOCK_ALL_CATEGORY_VALUE ||
      status !== "all" ||
      location !== "all",
  );

  const { categories, hasUncategorized } = useMemo(
    () => getStockOnHandCategories(ingredients),
    [ingredients],
  );
  const hasMultipleStockLocations = useMemo(() => {
    const locationKinds = new Set(
      ingredients.flatMap(
        (ingredient) =>
          ingredient.locationBreakdown?.map((row) => row.locationKind) ?? [],
      ),
    );

    return locationKinds.size > 1;
  }, [ingredients]);
  const filters = { category, location, query, status };
  const filtered = useMemo(
    () => filterStockOnHandIngredients(ingredients, filters),
    [ingredients, category, location, query, status],
  );
  const filtersActive = hasStockOnHandFilters(filters);
  const facetCount = [
    category !== STOCK_ALL_CATEGORY_VALUE,
    status !== "all",
    location !== "all",
  ].filter(Boolean).length;
  const isFirstLoadEmpty = !filtersActive && isPristineStockOnHand(ingredients);
  const locationScopeLabel =
    location === "warehouse"
      ? stockCopy.filters.locationWarehouse
      : location === "kitchen"
        ? stockCopy.filters.locationKitchen
        : null;
  const showReceiveAction =
    canCreateGrn && !coreDataLoadFailed && underThresholdCount === 0;
  const currentStockHref = searchParams.size
    ? `${pathname}?${searchParams.toString()}`
    : pathname;
  const returnToQuery = encodeURIComponent(currentStockHref);
  const contextualActions = [
    ...(canCreateStocktake
      ? [
          {
            key: "stocktake",
            href: `/br/${branchId}/stock/stocktake/new?returnTo=${returnToQuery}`,
            icon: IconClipboardCheck,
            title: stockCopy.actions.stocktake,
          },
        ]
      : []),
    ...(canWriteoff
      ? [
          {
            key: "waste",
            href: `/br/${branchId}/stock/waste?returnTo=${returnToQuery}`,
            icon: IconTrash,
            title: stockCopy.actions.waste,
          },
        ]
      : []),
  ];

  function replaceFilterParams(
    changes: Partial<Record<StockFilterParam, string | null>>,
  ) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }

    const nextQuery = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      nextQuery ? `${pathname}?${nextQuery}` : pathname,
    );
  }

  function resetFilters() {
    replaceFilterParams({
      category: null,
      location: null,
      q: null,
      status: null,
    });
    setFiltersOpen(false);
  }

  return (
    <BranchOperatorPage
      title={stockCopy.title}
      description={stockCopy.operatorDescription}
    >
      {!coreDataLoadFailed && underThresholdCount > 0 ? (
        <BranchOperatorPanel
          title={stockCopy.attention.title}
          description={stockCopy.attention.description(underThresholdCount)}
          tone="warning"
          badge={{
            children: underThresholdCount,
            variant: "warning",
          }}
          action={
            canCreateGrn ? (
              <Button asChild size="touch">
                <Link
                  href={`/br/${branchId}/stock/grn/new?returnTo=${returnToQuery}`}
                >
                  <IconTruck />
                  {stockCopy.actions.receiveGrn}
                </Link>
              </Button>
            ) : undefined
          }
          size="sm"
        >
          <p className="text-sm leading-6 text-muted-foreground">
            {stockCopy.attention.listHint}
          </p>
        </BranchOperatorPanel>
      ) : null}

      <BranchOperatorPanel
        title={stockCopy.table.currentStock}
        size="sm"
        badge={{
          children: stockCopy.filters.resultSummary(
            filtered.length,
            ingredients.length,
          ),
          variant: "secondary",
        }}
        action={
          showReceiveAction ? (
            <Button asChild size="touch">
              <Link
                href={`/br/${branchId}/stock/grn/new?returnTo=${returnToQuery}`}
              >
                <IconTruck />
                {stockCopy.actions.receiveGrn}
              </Link>
            </Button>
          ) : undefined
        }
        contentClassName="gap-3"
      >
        {coreDataLoadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            title={stockCopy.loadFailed}
            description={stockCopy.loadFailedDescription}
          >
            <Button type="button" size="touch" onClick={() => router.refresh()}>
              {ACTIONS_VI.retry}
            </Button>
          </AppEmptyState>
        ) : isFirstLoadEmpty ? (
          <AppEmptyState
            compact
            title={stockCopy.empty.firstLoadTitle}
            description={stockCopy.empty.firstLoadHint}
            symbol="riceGrain"
          >
            {canCreateGrn && underThresholdCount === 0 ? (
              <Button asChild size="touch">
                <Link
                  href={`/br/${branchId}/stock/grn/new?returnTo=${returnToQuery}`}
                >
                  <IconTruck />
                  {stockCopy.actions.receiveGrn}
                </Link>
              </Button>
            ) : null}
          </AppEmptyState>
        ) : (
          <>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <InputGroup className="min-h-12 min-w-0 flex-1">
                  <InputGroupAddon>
                    <IconSearch />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={query}
                    onChange={(event) =>
                      replaceFilterParams({ q: event.target.value || null })
                    }
                    placeholder={stockCopy.filters.searchPlaceholder}
                    aria-label={stockCopy.filters.searchPlaceholder}
                    inputMode="search"
                  />
                </InputGroup>

                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="w-full justify-between sm:w-auto sm:min-w-36"
                  aria-controls="branch-stock-on-hand-filters"
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <span className="inline-flex items-center gap-2">
                    <IconFilter />
                    {ACTIONS_VI.filter}
                    {facetCount > 0 ? (
                      <Badge variant="secondary">{facetCount}</Badge>
                    ) : null}
                  </span>
                  <IconChevronDown
                    className={cn(
                      "transition-transform duration-150",
                      filtersOpen && "rotate-180",
                    )}
                  />
                </Button>
              </div>

              <Item
                id="branch-stock-on-hand-filters"
                variant="muted"
                size="sm"
                className={cn(
                  "w-full gap-2",
                  filtersOpen ? "grid" : "hidden",
                  hasMultipleStockLocations
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-2",
                )}
              >
                <Select
                  value={status}
                  onValueChange={(value) =>
                    replaceFilterParams({
                      status: value === "all" ? null : value,
                    })
                  }
                >
                  <SelectTrigger
                    size="touch"
                    className="w-full"
                    aria-label={stockCopy.filters.statusPlaceholder}
                  >
                    <SelectValue
                      placeholder={stockCopy.filters.statusPlaceholder}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {stockFilterOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="min-h-11 py-2.5"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {hasMultipleStockLocations ? (
                  <Select
                    value={location}
                    onValueChange={(value) =>
                      replaceFilterParams({
                        location: value === "all" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger
                      size="touch"
                      className="w-full"
                      aria-label={stockCopy.filters.locationPlaceholder}
                    >
                      <SelectValue
                        placeholder={stockCopy.filters.locationPlaceholder}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {locationFilterOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="min-h-11 py-2.5"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}

                <Select
                  value={category}
                  onValueChange={(value) =>
                    replaceFilterParams({
                      category:
                        value === STOCK_ALL_CATEGORY_VALUE ? null : value,
                    })
                  }
                >
                  <SelectTrigger
                    size="touch"
                    className="w-full"
                    aria-label={stockCopy.filters.categoryPlaceholder}
                  >
                    <SelectValue
                      placeholder={stockCopy.filters.categoryPlaceholder}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value={STOCK_ALL_CATEGORY_VALUE}
                      className="min-h-11 py-2.5"
                    >
                      {stockCopy.filters.allCategories}
                    </SelectItem>
                    {categories.map((item) => (
                      <SelectItem
                        key={item}
                        value={item}
                        className="min-h-11 py-2.5"
                      >
                        {item}
                      </SelectItem>
                    ))}
                    {hasUncategorized ? (
                      <SelectItem
                        value={STOCK_NO_CATEGORY_VALUE}
                        className="min-h-11 py-2.5"
                      >
                        {stockCopy.filters.noCategory}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Item>
            </div>

            {filtersActive ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2",
                  locationScopeLabel ? "justify-between" : "justify-end",
                )}
              >
                {locationScopeLabel ? (
                  <Badge variant="outline">
                    {stockCopy.filters.locationScope(locationScopeLabel)}
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  onClick={resetFilters}
                >
                  <IconReset />
                  {ACTIONS_VI.clearFilters}
                </Button>
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <AppEmptyState
                compact
                mode={filtersActive ? "no-results" : "no-data"}
                title={
                  filtersActive
                    ? stockCopy.empty.search
                    : stockCopy.empty.noData
                }
                description={
                  filtersActive
                    ? stockCopy.empty.searchDescription
                    : stockCopy.empty.noDataDescription
                }
                symbol="riceGrain"
              >
                {filtersActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={resetFilters}
                  >
                    <IconReset />
                    {ACTIONS_VI.clearFilters}
                  </Button>
                ) : null}
              </AppEmptyState>
            ) : (
              <ItemGroup className="gap-2">
                {filtered.map((item) => (
                  <StockTouchRow
                    key={item.id}
                    branchId={branchId}
                    item={item}
                    returnTo={currentStockHref}
                  />
                ))}
              </ItemGroup>
            )}
          </>
        )}
      </BranchOperatorPanel>

      {contextualActions.length > 0 ? (
        <BranchOperatorActionSection
          title={stockCopy.filters.operatorTasksTitle}
          links={contextualActions}
          columns={2}
          mobileColumns={2}
          presentation="plain"
        />
      ) : null}
    </BranchOperatorPage>
  );
}
