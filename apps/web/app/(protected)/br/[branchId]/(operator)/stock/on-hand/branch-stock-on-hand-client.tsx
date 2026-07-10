"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  ListFilter as IconFilter,
  RotateCcw as IconReset,
  Search as IconSearch,
  Truck as IconTruck,
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
  ItemGroup,
  ItemSeparator,
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
];

function StockQuantity({ item }: { item: StockIngredient }) {
  const { base } = formatStockUnits(item.qty, item.units, formatQty);
  const atRisk = item.status === "low" || item.status === "out";

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

function StockTouchRow({
  branchId,
  item,
}: {
  branchId: number;
  item: StockIngredient;
}) {
  return (
    <Item
      asChild
      size="sm"
      className="min-h-11 touch-manipulation gap-2 px-0 py-1"
    >
      <Link
        href={`/br/${branchId}/stock/on-hand/${item.id}`}
        aria-label={stockCopy.actions.viewDetailAria(item.name)}
        role="listitem"
      >
        <ItemContent className="min-w-0">
          <ItemTitle size="heading" className="w-full">
            {item.name}
            <span className="shrink-0 font-sans text-2xs font-medium text-muted-foreground">
              {ITEM_KIND_LABELS[item.itemKind] ?? item.itemKind}
            </span>
          </ItemTitle>
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
  coreDataLoadFailed: boolean;
  ingredients: StockIngredient[];
  underThresholdCount: number;
}

export function BranchStockOnHandClient({
  branchId,
  canCreateGrn,
  coreDataLoadFailed,
  ingredients,
  underThresholdCount,
}: BranchStockOnHandClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(STOCK_ALL_CATEGORY_VALUE);
  const [status, setStatus] = useState<StockFilter>("all");
  const [location, setLocation] = useState<StockLocationFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { categories, hasUncategorized } = useMemo(
    () => getStockOnHandCategories(ingredients),
    [ingredients],
  );
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
    location === "warehouse" ? stockCopy.filters.locationWarehouse : null;

  function resetFilters() {
    setQuery("");
    setCategory(STOCK_ALL_CATEGORY_VALUE);
    setStatus("all");
    setLocation("all");
    setFiltersOpen(false);
  }

  return (
    <BranchOperatorPage
      title={stockCopy.title}
      description={stockCopy.operatorDescription}
      hideHeaderOnMobile
    >
      <BranchOperatorPanel
        title={stockCopy.table.currentStock}
        size="sm"
        tone={underThresholdCount > 0 ? "warning" : "default"}
        headerHint={
          underThresholdCount > 0 ? (
            <Badge variant="warning">
              {stockCopy.metrics.underThreshold}: {underThresholdCount}
            </Badge>
          ) : undefined
        }
        badge={{
          children: stockCopy.filters.resultSummary(
            filtered.length,
            ingredients.length,
          ),
          variant: "secondary",
        }}
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
            {canCreateGrn ? (
              <Button asChild size="touch">
                <Link href={`/br/${branchId}/stock/grn/new`}>
                  <IconTruck />
                  {stockCopy.actions.receiveGrn}
                </Link>
              </Button>
            ) : null}
          </AppEmptyState>
        ) : (
          <>
            <div className="grid min-w-0 gap-2 md:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(8rem,11rem))]">
              <InputGroup className="min-h-12 min-w-0 md:col-span-3 lg:col-span-1">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={stockCopy.filters.searchPlaceholder}
                  inputMode="search"
                />
              </InputGroup>

              <Button
                type="button"
                variant="outline"
                size="touch"
                className="w-full justify-between md:hidden"
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

              <div
                id="branch-stock-on-hand-filters"
                className={cn(
                  "col-span-full gap-2",
                  filtersOpen ? "grid" : "hidden",
                  "md:grid md:grid-cols-3 lg:contents",
                )}
              >
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as StockFilter)}
                >
                  <SelectTrigger size="touch" className="w-full">
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

                <Select
                  value={location}
                  onValueChange={(value) =>
                    setLocation(value as StockLocationFilter)
                  }
                >
                  <SelectTrigger size="touch" className="w-full">
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

                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger size="touch" className="w-full">
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
              </div>
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
                {filtered.map((item, index) => (
                  <Fragment key={item.id}>
                    <StockTouchRow branchId={branchId} item={item} />
                    {index < filtered.length - 1 ? (
                      <ItemSeparator className="my-0" />
                    ) : null}
                  </Fragment>
                ))}
              </ItemGroup>
            )}
          </>
        )}
      </BranchOperatorPanel>
    </BranchOperatorPage>
  );
}
