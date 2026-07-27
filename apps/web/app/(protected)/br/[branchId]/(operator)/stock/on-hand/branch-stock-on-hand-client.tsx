"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
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
import { formatQty } from "@lib/inventory/format";
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
  isStockReorderRisk,
  type StockFilter,
  type StockIngredient,
} from "@lib/inventory/stock-on-hand-model";
import { messages } from "@lib/messages";

const stockCopy = messages.inventory.stock;
const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: stockCopy.filters.allStatuses },
  { value: "in_stock", label: stockCopy.filters.inStock },
  { value: "low", label: stockCopy.filters.low },
  { value: "out", label: stockCopy.filters.out },
];

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
}: {
  branchId: number;
  item: StockIngredient;
}) {
  return (
    <Item
      variant="default"
      size="sm"
      className="min-h-11 touch-manipulation gap-2 rounded-none border-x-0 border-t-0 border-b border-border px-2 py-1 last:border-b-0"
      render={
        <Link
          href={`/br/${branchId}/stock/on-hand/${item.id}`}
          aria-label={stockCopy.actions.viewDetailAria(item.name)}
          role="listitem"
        />
      }
    >
      <ItemContent className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <ItemTitle size="heading" className="min-w-0 flex-1">
            {item.name}
          </ItemTitle>
          <StockRiskBadge item={item} />
        </div>
        <ItemDescription>
          {[ITEM_KIND_LABELS[item.itemKind] ?? UNKNOWN_LABEL_VI, item.sku]
            .filter(Boolean)
            .join(" · ")}
        </ItemDescription>
      </ItemContent>

      <ItemActions className="min-w-0 justify-end">
        <StockQuantity item={item} />
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </ItemActions>
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { categories, hasUncategorized } = useMemo(
    () => getStockOnHandCategories(ingredients),
    [ingredients],
  );
  const filters = { category, query, status };
  const filtered = useMemo(
    () => filterStockOnHandIngredients(ingredients, filters),
    [ingredients, category, query, status],
  );
  const filtersActive = hasStockOnHandFilters(filters);
  const facetCount = [
    category !== STOCK_ALL_CATEGORY_VALUE,
    status !== "all",
  ].filter(Boolean).length;
  const isFirstLoadEmpty = !filtersActive && isPristineStockOnHand(ingredients);
  const showReceiveAction =
    canCreateGrn && !coreDataLoadFailed && underThresholdCount === 0;

  function resetFilters() {
    setQuery("");
    setCategory(STOCK_ALL_CATEGORY_VALUE);
    setStatus("all");
    setFiltersOpen(false);
  }

  return (
    <BranchOperatorPage
      title={stockCopy.title}
      description={stockCopy.operatorDescription}
      hideHeaderOnMobile
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
              <Button
                size="touch"
                render={<Link href={`/br/${branchId}/stock/grn/new`} />}
              >
                <IconTruck />
                {stockCopy.actions.receiveGrn}
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
            <Button
              size="touch"
              render={<Link href={`/br/${branchId}/stock/grn/new`} />}
            >
              <IconTruck />
              {stockCopy.actions.receiveGrn}
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
            {canCreateGrn ? (
              <Button
                size="touch"
                render={<Link href={`/br/${branchId}/stock/grn/new`} />}
              >
                <IconTruck />
                {stockCopy.actions.receiveGrn}
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
                    aria-label={stockCopy.filters.searchPlaceholder}
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
                  "sm:grid-cols-2",
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
                        size="touch"
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
                    <SelectItem value={STOCK_ALL_CATEGORY_VALUE} size="touch">
                      {stockCopy.filters.allCategories}
                    </SelectItem>
                    {categories.map((item) => (
                      <SelectItem key={item} value={item} size="touch">
                        {item}
                      </SelectItem>
                    ))}
                    {hasUncategorized ? (
                      <SelectItem value={STOCK_NO_CATEGORY_VALUE} size="touch">
                        {stockCopy.filters.noCategory}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </Item>
            </div>

            {filtersActive ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
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
              <div role="list" className="flex flex-col">
                {filtered.map((item) => (
                  <StockTouchRow
                    key={item.id}
                    branchId={branchId}
                    item={item}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </BranchOperatorPanel>
    </BranchOperatorPage>
  );
}
